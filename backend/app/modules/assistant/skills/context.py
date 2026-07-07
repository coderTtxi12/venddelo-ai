from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.uow import SqlAlchemyUnitOfWork


@dataclass(frozen=True, slots=True)
class AgentContext:
    restaurant_id: uuid.UUID
    conversation_id: uuid.UUID
    uow: SqlAlchemyUnitOfWork
    effective_skill_ids: list[str]


def commit_agent_mutation(ctx: AgentContext) -> None:
    """Persist assistant tool mutations immediately (SSE streams may rollback on exit)."""
    ctx.uow.commit()
