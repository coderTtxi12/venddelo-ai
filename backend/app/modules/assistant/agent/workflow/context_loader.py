"""Assemble runtime context before the workflow agents run."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord, WorkflowEvaluation, WorkflowPlan
from app.modules.assistant.context.compressor import compress_history_for_llm
from app.modules.assistant.conversation_store import (
    assistant_repository,
    ensure_conversation,
    load_recent_history,
)
from app.modules.assistant.entitlements.adapters import SqlAlchemyRestaurantEntitlementsRepository
from app.modules.assistant.entitlements.catalog import DEFAULT_GRANTED_SKILL_IDS
from app.modules.assistant.entitlements.resolver import resolve_entitlements
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.profile.service import AssistantProfileService
from app.modules.assistant.schemas import AssistantChatHistoryMessage
from app.modules.assistant.skills.discovery import discover_skill_executors
from app.modules.assistant.skills.markdown import load_skill_metadata
from app.modules.assistant.skills.registry import SkillRegistry


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


@dataclass(frozen=True, slots=True)
class WorkflowRuntimeBundle:
    context: WorkflowContext
    registry: SkillRegistry
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


def load_workflow_runtime(
    *,
    uow: SqlAlchemyUnitOfWork,
    restaurant_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    user_message: str,
    settings: Settings | None = None,
    rollout_skill_ids: tuple[str, ...] | None = None,
) -> WorkflowRuntimeBundle:
    resolved_settings = settings or get_settings()
    cleaned = user_message.strip()
    if not cleaned:
        raise ValueError("message is required")

    repo = assistant_repository(uow)
    resolved_conversation_id = ensure_conversation(
        repo,
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
    if not effective_skill_ids:
        raise ValueError("No assistant skills are enabled for this restaurant")

    registry = SkillRegistry(
        [skill for skill in discover_skill_executors() if skill.id in effective_skill_ids]
    )
    system_prompt = compose_system_prompt(profile, effective_skill_ids=effective_skill_ids)

    history = load_recent_history(repo, resolved_conversation_id, settings=resolved_settings)
    if resolved_settings.assistant_context_compression_enabled:
        compressed = compress_history_for_llm(
            history,
            system_prompt=system_prompt,
            user_message=cleaned,
            max_context_tokens=resolved_settings.assistant_context_max_tokens,
            threshold_ratio=resolved_settings.assistant_context_compression_threshold_ratio,
            recent_window_turns=resolved_settings.assistant_context_recent_window_turns,
        )
        history = compressed.history

    context = WorkflowContext(
        user_message=cleaned,
        restaurant_id=restaurant_id,
        conversation_id=resolved_conversation_id,
        effective_skill_ids=effective_skill_ids,
        skill_catalog=build_skill_catalog(registry, effective_skill_ids),
        system_prompt=system_prompt,
        conversation_history=_format_history(history),
        assistant_display_name=profile.display_name.strip(),
    )
    return WorkflowRuntimeBundle(
        context=context,
        registry=registry,
        conversation_id=resolved_conversation_id,
    )


def planner_input(context: WorkflowContext) -> str:
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}"
    )


def executor_input(context: WorkflowContext, plan: WorkflowPlan) -> str:
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}\n\n"
        f"## Plan to execute\n\n{plan.model_dump_json(indent=2)}"
    )


def evaluator_input(
    context: WorkflowContext,
    plan: WorkflowPlan,
    execution: ExecutionRecord,
) -> str:
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}\n\n"
        f"## Plan\n\n{plan.model_dump_json(indent=2)}\n\n"
        f"## Execution result\n\n{execution.model_dump_json(indent=2)}"
    )


def replanner_input(
    context: WorkflowContext,
    plan: WorkflowPlan,
    execution: ExecutionRecord,
    evaluation: WorkflowEvaluation,
) -> str:
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}\n\n"
        f"## Previous plan\n\n{plan.model_dump_json(indent=2)}\n\n"
        f"## Execution result\n\n{execution.model_dump_json(indent=2)}\n\n"
        f"## Evaluator issues\n\n{evaluation.model_dump_json(indent=2)}"
    )


def _format_execution_findings(execution: ExecutionRecord) -> str:
    payload = execution.model_dump(
        exclude={"tools_used", "requires_user_approval", "approval_reason"},
        mode="json",
    )
    has_content = bool(
        execution.summary.strip()
        or execution.executed_steps
        or execution.notes
        or execution.status != "success"
    )
    if not has_content:
        return "El executor terminó sin hallazgos."

    return "```json\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"


def _format_evaluation_result(evaluation: WorkflowEvaluation) -> str:
    payload = evaluation.model_dump(mode="json")
    return "```json\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"


def responder_input(
    context: WorkflowContext,
    plan: WorkflowPlan,
    execution: ExecutionRecord,
    evaluation: WorkflowEvaluation,
) -> str:
    if plan.is_direct:
        return (
            f"## Conversation history\n\n{context.conversation_history}\n\n"
            f"## User request\n\n{context.user_message}\n\n"
            "## Findings\n\n(Sin investigación de datos: responde de forma conversacional.)"
        )
    return (
        f"## Conversation history\n\n{context.conversation_history}\n\n"
        f"## User request\n\n{context.user_message}\n\n"
        f"## Plan summary\n\n{plan.goal}\n\n"
        f"## Findings\n\n{_format_execution_findings(execution)}\n\n"
        f"## Evaluation\n\n{_format_evaluation_result(evaluation)}"
    )
