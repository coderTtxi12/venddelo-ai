"""Assemble runtime context before the workflow agents run."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.chat_attachment_describer import describe_chat_attachments
from app.modules.assistant.chat_attachments import (
    append_attachment_descriptions,
    build_agent_user_request,
    describe_attachments_for_history,
    format_chat_attachments_block,
    strip_chat_attachments_block,
)
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
    build_router_import_session_context,
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
    current_turn_attachments_context: str | None = None
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
        content = item.content
        if item.role == "user":
            content = strip_chat_attachments_block(content)
        lines.append(f"{speaker}: {content}")
    return "\n\n".join(lines)


async def _build_conversation_history(
    repo,
    conversation_id: uuid.UUID,
    *,
    settings: Settings,
    system_prompt: str,
    user_message: str,
    message_limit: int,
    apply_compression: bool,
) -> str:
    history = load_recent_history(
        repo,
        conversation_id,
        settings=settings,
        message_limit=message_limit,
    )
    if apply_compression and settings.assistant_context_compression_enabled:
        compressed = await compress_history_for_llm(
            history,
            settings=settings,
            system_prompt=system_prompt,
            user_message=user_message,
        )
        history = compressed.history
    return _format_history(history)


def build_menu_import_registry() -> SkillRegistry | None:
    executors = [skill for skill in discover_skill_executors() if skill.id == "menu_import"]
    if not executors:
        return None
    return SkillRegistry(executors)


async def load_workflow_runtime(
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
    attachment_list = attachments or []
    user_text = user_message.strip()
    if attachment_list:
        descriptions = await describe_chat_attachments(
            attachment_list,
            settings=resolved_settings,
        )
        user_text = append_attachment_descriptions(
            user_text,
            attachment_list,
            descriptions,
        )
    if not user_text and attachment_list:
        user_text = describe_attachments_for_history(attachment_list)
    if not user_text and not attachment_list:
        raise ValueError("message or attachments required")

    current_turn_attachments_context = (
        format_chat_attachments_block(attachment_list) or None
    )

    resolved_conversation_id = ensure_conversation_committed(
        restaurant_id=restaurant_id,
        conversation_id=conversation_id,
        first_message=user_text,
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
    menu_import_enabled = "menu_import" in _discovered_skill_ids()
    menu_import_registry = build_menu_import_registry() if menu_import_enabled else None
    menu_sources = menu_source_attachments(attachment_list)

    replace_import_session_if_needed(
        restaurant_id=restaurant_id,
        attachments=attachment_list,
    )

    import_session_context: str | None = None
    active_import = None
    if menu_import_enabled:
        active_import = get_active_import_for_conversation(
            uow,
            restaurant_id=restaurant_id,
            conversation_id=resolved_conversation_id,
        )

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

    repo = assistant_repository(uow)
    conversation_history = await _build_conversation_history(
        repo,
        resolved_conversation_id,
        settings=resolved_settings,
        system_prompt=system_prompt,
        user_message=user_text,
        message_limit=resolved_settings.assistant_router_llm_context_message_limit,
        apply_compression=False,
    )

    menu_import_conversation_history = EMPTY_CONVERSATION_HISTORY
    if menu_import_enabled:
        menu_import_conversation_history = await _build_conversation_history(
            repo,
            resolved_conversation_id,
            settings=resolved_settings,
            system_prompt=system_prompt,
            user_message=user_text,
            message_limit=resolved_settings.assistant_llm_context_message_limit,
            apply_compression=True,
        )

    if menu_import_enabled:
        import_session_context = build_router_import_session_context(
            active_import,
            user_message=user_text,
        )

    context = WorkflowContext(
        user_message=user_text,
        restaurant_id=restaurant_id,
        conversation_id=resolved_conversation_id,
        effective_skill_ids=effective_skill_ids,
        skill_catalog=build_skill_catalog(registry, effective_skill_ids),
        system_prompt=system_prompt,
        conversation_history=conversation_history,
        assistant_display_name=profile.display_name.strip(),
        menu_import_conversation_history=menu_import_conversation_history,
        menu_import_enabled=menu_import_enabled,
        menu_source_attachment_count=len(menu_sources),
        import_session_context=import_session_context,
        current_turn_attachments_context=current_turn_attachments_context,
    )

    # Commit profile/entitlements/conversation setup before the long-lived SSE stream.
    # Otherwise a second chat request can block on the uncommitted PK insert.
    uow.commit()

    return WorkflowRuntimeBundle(
        context=context,
        registry=registry,
        menu_import_registry=menu_import_registry,
        conversation_id=resolved_conversation_id,
    )


def orchestrator_input(context: WorkflowContext) -> str:
    parts = [
        f"## Conversation history\n\n{context.conversation_history}",
        (
            "## User request\n\n"
            + build_agent_user_request(
                context.user_message,
                context.current_turn_attachments_context,
            )
        ),
    ]
    return "\n\n".join(parts)


def catalog_agent_input(context: WorkflowContext, task: str) -> str:
    _ = context
    return f"## Delegated task\n\n{task.strip()}\n"


# Back-compat alias.
restaurant_ops_input = catalog_agent_input


def operations_agent_input(context: WorkflowContext, task: str) -> str:
    _ = context
    return f"## Delegated task\n\n{task.strip()}\n"


def menu_subagent_input(context: WorkflowContext, task: str) -> str:
    parts = [f"## Delegated task\n\n{task.strip()}"]
    if context.import_session_context:
        parts.append(f"## Import session\n\n{context.import_session_context}")
    if context.menu_source_attachment_count:
        parts.append(
            "Registra en esta sesión **solo** los archivos de menú (PDF/DOCX) "
            "adjuntos en el turno actual del dueño."
        )
    if context.current_turn_attachments_context:
        parts.append(context.current_turn_attachments_context)
    return "\n\n".join(parts)

