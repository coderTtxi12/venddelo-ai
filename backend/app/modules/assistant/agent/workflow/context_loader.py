"""Assemble runtime context before the workflow agents run."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    WorkflowEvaluation,
    WorkflowRouteDecision,
)
from app.modules.assistant.chat_attachments import format_user_message_with_attachments
from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.conversation_store import (
    assistant_repository,
    ensure_conversation_committed,
    load_recent_history,
)
from app.modules.assistant.entitlements.adapters import SqlAlchemyRestaurantEntitlementsRepository
from app.modules.assistant.entitlements.catalog import DEFAULT_GRANTED_SKILL_IDS
from app.modules.assistant.entitlements.resolver import resolve_entitlements
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.profile.service import AssistantProfileService
from app.modules.assistant.schemas import AssistantChatHistoryMessage, ChatAttachmentRef
from app.modules.assistant.skills.discovery import discover_skill_executors
from app.modules.assistant.skills.markdown import load_skill_metadata
from app.modules.assistant.skills.menu_import.session_context import (
    build_import_session_context,
    get_active_import_for_conversation,
)
from app.modules.assistant.skills.menu_import.session_handoff import (
    menu_source_attachments,
    replace_import_session_if_needed,
)
from app.modules.assistant.skills.registry import SkillRegistry

WORKFLOW_EXCLUDED_SKILL_IDS = frozenset({"menu_import"})
EMPTY_CONVERSATION_HISTORY = "(sin historial previo en esta conversación)"


@dataclass(frozen=True, slots=True)
class WorkflowContext:
    user_message: str
    restaurant_id: uuid.UUID
    conversation_id: uuid.UUID
    effective_skill_ids: list[str]
    skill_catalog: str
    system_prompt: str
    conversation_history: str
    assistant_display_name: str
    menu_import_conversation_history: str = EMPTY_CONVERSATION_HISTORY
    menu_import_enabled: bool = False
    menu_source_attachment_count: int = 0
    import_session_context: str | None = None


@dataclass(frozen=True, slots=True)
class WorkflowRuntimeBundle:
    context: WorkflowContext
    registry: SkillRegistry
    menu_import_registry: SkillRegistry | None
    conversation_id: uuid.UUID


def _profile_service(uow: SqlAlchemyUnitOfWork, settings: Settings) -> AssistantProfileService:
    return AssistantProfileService(
        SqlAlchemyAssistantProfileRepository(uow.session),
        SqlAlchemyRestaurantEntitlementsRepository(uow.session),
        uow.restaurants,
        settings=settings,
    )


def _discovered_skill_ids() -> set[str]:
    return {skill.id for skill in discover_skill_executors()}


def resolve_runtime_skill_ids(
    profile_enabled: list[str],
    *,
    rollout_skill_ids: tuple[str, ...] | None = None,
) -> list[str]:
    """Entitled skills that also have a discovered executor on disk."""
    discovered = _discovered_skill_ids()
    effective = set(profile_enabled) & discovered
    if rollout_skill_ids is not None:
        effective &= set(rollout_skill_ids)
    return sorted(effective)


def build_skill_catalog(registry: SkillRegistry, effective_skill_ids: list[str]) -> str:
    lines: list[str] = []
    for skill_id in effective_skill_ids:
        meta = load_skill_metadata(skill_id)
        description = meta.get("description") or skill_id
        tool_names = sorted(
            tool.name for sid, tool in registry.entitled_tools(effective_skill_ids) if sid == skill_id
        )
        tools_text = ", ".join(tool_names) if tool_names else "(sin tools)"
        lines.append(f"- **{skill_id}**: {description}\n  Tools: {tools_text}")
    return "\n".join(lines)


def _format_history(messages: list[AssistantChatHistoryMessage]) -> str:
    if not messages:
        return "(sin historial previo en esta conversación)"
    lines: list[str] = []
    for item in messages:
        speaker = "Usuario" if item.role == "user" else "Asistente"
        lines.append(f"{speaker}: {item.content}")
    return "\n\n".join(lines)


def build_menu_import_registry() -> SkillRegistry | None:
    executors = [skill for skill in discover_skill_executors() if skill.id == "menu_import"]
    if not executors:
        return None
    return SkillRegistry(executors)


def load_workflow_runtime(
    *,
    uow: SqlAlchemyUnitOfWork,
    restaurant_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    user_message: str,
    attachments: list[ChatAttachmentRef] | None = None,
    settings: Settings | None = None,
    rollout_skill_ids: tuple[str, ...] | None = None,
) -> WorkflowRuntimeBundle:
    resolved_settings = settings or get_settings()
    cleaned = format_user_message_with_attachments(user_message, attachments or [])

    resolved_conversation_id = ensure_conversation_committed(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        first_message=cleaned,
    )

    profile_service = _profile_service(uow, resolved_settings)
    profile = profile_service.get_or_create(restaurant_id)
    entitlement_repo = SqlAlchemyRestaurantEntitlementsRepository(uow.session)
    entitlements = entitlement_repo.get_or_create_default(
        restaurant_id,
        granted_skill_ids=list(DEFAULT_GRANTED_SKILL_IDS),
        source="default",
    )
    effective_skill_ids = resolve_runtime_skill_ids(
        resolve_entitlements(
            enabled_skill_ids=profile.enabled_skill_ids,
            entitlements=entitlements,
        ).effective_skill_ids,
        rollout_skill_ids=rollout_skill_ids,
    )
    menu_import_enabled = "menu_import" in effective_skill_ids
    menu_import_registry = build_menu_import_registry() if menu_import_enabled else None
    menu_sources = menu_source_attachments(attachments or [])

    replace_import_session_if_needed(
        restaurant_id=restaurant_id,
        attachments=attachments or [],
    )

    import_session_context: str | None = None
    if menu_import_enabled:
        active_import = get_active_import_for_conversation(
            uow,
            restaurant_id=restaurant_id,
            conversation_id=resolved_conversation_id,
        )
        import_session_context = build_import_session_context(active_import)

    effective_skill_ids = [
        skill_id
        for skill_id in effective_skill_ids
        if skill_id not in WORKFLOW_EXCLUDED_SKILL_IDS
    ]
    if not effective_skill_ids:
        raise ValueError("No assistant skills are enabled for this restaurant")

    registry = SkillRegistry(
        [skill for skill in discover_skill_executors() if skill.id in effective_skill_ids]
    )
    system_prompt = compose_system_prompt(profile, effective_skill_ids=effective_skill_ids)

    menu_import_conversation_history = EMPTY_CONVERSATION_HISTORY
    if menu_import_enabled:
        repo = assistant_repository(uow)
        import_history = load_recent_history(
            repo,
            resolved_conversation_id,
            settings=resolved_settings,
        )
        if resolved_settings.assistant_context_compression_enabled:
            compressed = compress_history_for_llm(
                import_history,
                system_prompt=system_prompt,
                user_message=cleaned,
                max_context_tokens=resolved_settings.assistant_context_max_tokens,
                threshold_ratio=resolved_settings.assistant_context_compression_threshold_ratio,
                recent_window_turns=resolved_settings.assistant_context_recent_window_turns,
            )
            import_history = compressed.history
        menu_import_conversation_history = _format_history(import_history)

    context = WorkflowContext(
        user_message=cleaned,
        restaurant_id=restaurant_id,
        conversation_id=resolved_conversation_id,
        effective_skill_ids=effective_skill_ids,
        skill_catalog=build_skill_catalog(registry, effective_skill_ids),
        system_prompt=system_prompt,
        conversation_history=EMPTY_CONVERSATION_HISTORY,
        assistant_display_name=profile.display_name.strip(),
        menu_import_conversation_history=menu_import_conversation_history,
        menu_import_enabled=menu_import_enabled,
        menu_source_attachment_count=len(menu_sources),
        import_session_context=import_session_context,
    )
    return WorkflowRuntimeBundle(
        context=context,
        registry=registry,
        menu_import_registry=menu_import_registry,
        conversation_id=resolved_conversation_id,
    )


def router_input(context: WorkflowContext) -> str:
    parts = [
        f"## Conversation history\n\n{context.conversation_history}",
        f"## User request\n\n{context.user_message}",
    ]
    if context.menu_import_enabled:
        parts.append("## Menu import capability\n\nDisponible para este restaurante.")
        if context.menu_source_attachment_count:
            parts.append(
                f"El usuario adjuntó **{context.menu_source_attachment_count}** archivo(s) "
                "de menú (`menu_source`) en este mensaje."
            )
            parts.append(
                "Con archivos `menu_source`, la subida/importación del menú va a "
                "**menu_import** — no al executor de altas manuales."
            )
    if context.import_session_context:
        parts.append(f"## Active menu import session\n\n{context.import_session_context}")
    return "\n\n".join(parts)


def menu_import_input(context: WorkflowContext, route: WorkflowRouteDecision) -> str:
    parts = [
        f"## Conversation history\n\n{context.menu_import_conversation_history}",
        f"## User request\n\n{context.user_message}",
        f"## User goal\n\n{route.goal}",
    ]
    if context.import_session_context:
        parts.append(f"## Import session\n\n{context.import_session_context}")
    if context.menu_source_attachment_count:
        parts.append(
            "Registra en esta sesión **solo** los archivos `menu_source` listados en "
            "## User request de este turno."
        )
    return "\n\n".join(parts)


def menu_import_responder_input(
    context: WorkflowContext,
    route: WorkflowRouteDecision,
    execution: ExecutionRecord,
) -> str:
    parts = [
        f"## Conversation history\n\n{context.menu_import_conversation_history}",
        f"## User request\n\n{context.user_message}",
        f"## User goal\n\n{route.goal}",
        f"## Execution findings\n\n{_format_execution_findings(execution)}",
    ]
    if context.import_session_context:
        parts.append(f"## Import session\n\n{context.import_session_context}")
    return "\n\n".join(parts) + "\n"


def executor_input(
    context: WorkflowContext,
    route: WorkflowRouteDecision,
    *,
    previous_execution: ExecutionRecord | None = None,
    evaluation: WorkflowEvaluation | None = None,
) -> str:
    parts = [
        f"## Conversation history\n\n{context.conversation_history}",
        f"## User request\n\n{context.user_message}",
        f"## User goal\n\n{route.goal}",
    ]
    if previous_execution is not None and evaluation is not None:
        parts.extend(
            [
                f"## Previous attempt\n\n{previous_execution.model_dump_json(indent=2)}",
                f"## Evaluator feedback (retry with a different approach)\n\n"
                f"{evaluation.model_dump_json(indent=2)}",
            ]
        )
    return "\n\n".join(parts) + "\n"


def evaluator_input(
    context: WorkflowContext,
    route: WorkflowRouteDecision,
    execution: ExecutionRecord,
) -> str:
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}\n\n"
        f"## User goal\n\n{route.goal}\n\n"
        f"## Execution result\n\n{execution.model_dump_json(indent=2)}"
    )


def _format_execution_findings(execution: ExecutionRecord) -> str:
    has_content = bool(
        execution.summary.strip()
        or execution.executed_steps
        or execution.notes
        or execution.status != "success"
    )
    if not has_content:
        return "El executor terminó sin hallazgos."

    parts: list[str] = []
    if execution.summary.strip():
        parts.append("### Datos para responder\n\n" + execution.summary.strip())

    metadata = execution.model_dump(
        exclude={"summary", "tools_used", "requires_user_approval", "approval_reason"},
        mode="json",
    )
    has_metadata = bool(
        metadata.get("executed_steps")
        or metadata.get("notes")
        or metadata.get("status") != "success"
    )
    if has_metadata:
        parts.append(
            "### Metadatos de ejecución\n\n```json\n"
            + json.dumps(metadata, ensure_ascii=False, indent=2)
            + "\n```"
        )

    return "\n\n".join(parts)


def _format_evaluation_result(evaluation: WorkflowEvaluation) -> str:
    payload = evaluation.model_dump(mode="json")
    return "```json\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"


def responder_input(
    context: WorkflowContext,
    route: WorkflowRouteDecision,
    execution: ExecutionRecord,
    evaluation: WorkflowEvaluation,
) -> str:
    if route.is_direct:
        return (
            f"## Conversation history\n\n{context.conversation_history}\n\n"
            f"## User request\n\n{context.user_message}\n\n"
            f"## User goal\n\n{route.goal}\n\n"
            "## Findings\n\n(Sin investigación de datos: responde de forma conversacional.)"
        )
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}\n\n"
        f"## User goal\n\n{route.goal}\n\n"
        f"## Findings\n\n{_format_execution_findings(execution)}\n\n"
        f"## Evaluation\n\n{_format_evaluation_result(evaluation)}"
    )
