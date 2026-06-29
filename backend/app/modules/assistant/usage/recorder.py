from __future__ import annotations

import logging
import uuid
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.modules.assistant.usage.pricing_catalog import compute_llm_cost_usd
from app.modules.assistant.usage.schemas import LLMUsageCreate

logger = logging.getLogger(__name__)


class AssistantUsageRepository(Protocol):
    def insert(self, usage: LLMUsageCreate): ...


def record_llm_usage(
    repository: AssistantUsageRepository,
    *,
    restaurant_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    message_id: uuid.UUID | None,
    call_type: str,
    usage_payload: dict[str, Any] | None,
    metadata: dict[str, Any] | None = None,
    session: Session | None = None,
) -> None:
    if not usage_payload:
        return

    try:
        provider = str(usage_payload.get("provider") or "unknown")
        model = str(usage_payload.get("model") or provider)
        input_tokens = int(usage_payload.get("input_tokens") or 0)
        output_tokens = int(usage_payload.get("output_tokens") or 0)
        cost_usd = compute_llm_cost_usd(model, input_tokens, output_tokens)
        usage = LLMUsageCreate(
            restaurant_id=restaurant_id,
            conversation_id=conversation_id,
            message_id=message_id,
            call_type=call_type,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            metadata=metadata,
        )
        if session is not None:
            with session.begin_nested():
                repository.insert(usage)
        else:
            repository.insert(usage)
    except Exception:  # noqa: BLE001 - usage metering is best-effort observability
        logger.warning(
            "failed to record assistant llm usage restaurant_id=%s conversation_id=%s",
            restaurant_id,
            conversation_id,
            exc_info=True,
        )
