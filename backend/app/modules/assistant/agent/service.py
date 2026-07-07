from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.core.llm.ports import ChatStreamEvent
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.tracing import ensure_assistant_agent_tracing
from app.modules.assistant.agent.workflow.orchestrator import WorkflowOrchestrator
from app.modules.assistant.skills.discovery import discover_skill_executors
from app.modules.assistant.skills.registry import SkillRegistry

# Optional hard cap for staged rollouts. ``None`` uses all entitled + discovered skills.
ASSISTANT_ROLLOUT_SKILL_IDS: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class AssistantChatResult:
    conversation_id: uuid.UUID
    content: str


def aggregate_assistant_stream_output(content_parts: list[str]) -> dict[str, object]:
    content = "".join(content_parts)
    return {
        "content": content,
        "content_length": len(content),
    }


def build_skill_registry(enabled_skill_ids: tuple[str, ...] | list[str]) -> SkillRegistry:
    enabled = list(enabled_skill_ids)
    skills = [skill for skill in discover_skill_executors() if skill.id in enabled]
    missing = sorted(set(enabled) - {skill.id for skill in skills})
    if missing:
        raise ValueError(f"Enabled skills are not registered: {', '.join(missing)}")
    return SkillRegistry(skills)


class AssistantAgentService:
    def __init__(
        self,
        *,
        settings: Settings | None = None,
        orchestrator: WorkflowOrchestrator | None = None,
        rollout_skill_ids: tuple[str, ...] | None = ASSISTANT_ROLLOUT_SKILL_IDS,
    ) -> None:
        self._settings = settings or get_settings()
        self._rollout_skill_ids = rollout_skill_ids
        self._orchestrator = orchestrator or WorkflowOrchestrator(
            settings=self._settings,
            rollout_skill_ids=self._rollout_skill_ids,
        )

    def _require_openai_api_key(self) -> None:
        if not self._settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required for the OpenAI Agents assistant")

    def _prepare_runtime(self) -> None:
        os.environ.setdefault("OPENAI_API_KEY", self._settings.openai_api_key or "")
        ensure_assistant_agent_tracing(self._settings)

    async def run_chat(
        self,
        *,
        uow: SqlAlchemyUnitOfWork,
        restaurant_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
    ) -> AssistantChatResult:
        self._require_openai_api_key()
        self._prepare_runtime()

        resolved_conversation_id, content = await self._orchestrator.run_chat(
            uow=uow,
            restaurant_id=restaurant_id,
            message=message,
            conversation_id=conversation_id,
        )
        return AssistantChatResult(
            conversation_id=resolved_conversation_id,
            content=content,
        )

    async def stream_chat(
        self,
        *,
        uow: SqlAlchemyUnitOfWork,
        restaurant_id: uuid.UUID,
        message: str,
        conversation_id: uuid.UUID | None = None,
    ) -> AsyncIterator[ChatStreamEvent]:
        self._require_openai_api_key()
        self._prepare_runtime()

        async for event in self._orchestrator.stream_chat(
            uow=uow,
            restaurant_id=restaurant_id,
            message=message,
            conversation_id=conversation_id,
        ):
            yield event

    @staticmethod
    def format_sse(event: ChatStreamEvent) -> str:
        return f"event: {event.event}\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
