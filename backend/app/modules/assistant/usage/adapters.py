from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.assistant import AssistantLLMUsage
from app.modules.assistant.usage.schemas import (
    LLMUsageByCallType,
    LLMUsageCreate,
    LLMUsageRecord,
    LLMUsageSummary,
)


def _record(obj: AssistantLLMUsage) -> LLMUsageRecord:
    return LLMUsageRecord(
        id=obj.id,
        restaurant_id=obj.restaurant_id,
        conversation_id=obj.conversation_id,
        message_id=obj.message_id,
        call_type=obj.call_type,
        provider=obj.provider,
        model=obj.model,
        input_tokens=obj.input_tokens,
        output_tokens=obj.output_tokens,
        cost_usd=Decimal(obj.cost_usd),
        metadata=obj.metadata_json,
        created_at=obj.created_at,
    )


class SqlAlchemyAssistantUsageRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def insert(self, usage: LLMUsageCreate) -> LLMUsageRecord:
        obj = AssistantLLMUsage(
            restaurant_id=usage.restaurant_id,
            conversation_id=usage.conversation_id,
            message_id=usage.message_id,
            call_type=usage.call_type,
            provider=usage.provider,
            model=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
            cost_usd=usage.cost_usd,
            metadata_json=usage.metadata,
        )
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return _record(obj)

    def summarize(self, restaurant_id: uuid.UUID) -> LLMUsageSummary:
        totals_stmt = select(
            func.count(AssistantLLMUsage.id),
            func.coalesce(func.sum(AssistantLLMUsage.input_tokens), 0),
            func.coalesce(func.sum(AssistantLLMUsage.output_tokens), 0),
            func.coalesce(func.sum(AssistantLLMUsage.total_tokens), 0),
            func.coalesce(func.sum(AssistantLLMUsage.cost_usd), 0),
        ).where(AssistantLLMUsage.restaurant_id == restaurant_id)
        totals = self._session.execute(totals_stmt).one()

        grouped_stmt = (
            select(
                AssistantLLMUsage.call_type,
                func.count(AssistantLLMUsage.id),
                func.coalesce(func.sum(AssistantLLMUsage.input_tokens), 0),
                func.coalesce(func.sum(AssistantLLMUsage.output_tokens), 0),
                func.coalesce(func.sum(AssistantLLMUsage.total_tokens), 0),
                func.coalesce(func.sum(AssistantLLMUsage.cost_usd), 0),
            )
            .where(AssistantLLMUsage.restaurant_id == restaurant_id)
            .group_by(AssistantLLMUsage.call_type)
            .order_by(AssistantLLMUsage.call_type.asc())
        )
        by_call_type = [
            LLMUsageByCallType(
                call_type=row[0],
                calls=int(row[1]),
                input_tokens=int(row[2]),
                output_tokens=int(row[3]),
                total_tokens=int(row[4]),
                cost_usd=Decimal(row[5]).quantize(Decimal("0.000001")),
            )
            for row in self._session.execute(grouped_stmt)
        ]

        return LLMUsageSummary(
            restaurant_id=restaurant_id,
            calls=int(totals[0]),
            input_tokens=int(totals[1]),
            output_tokens=int(totals[2]),
            total_tokens=int(totals[3]),
            cost_usd=Decimal(totals[4]).quantize(Decimal("0.000001")),
            by_call_type=by_call_type,
        )
