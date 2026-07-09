"""Phase 2: apply owner context and product-modeling rules to a literal OCR draft."""

from __future__ import annotations

import json
from typing import Any

from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, LLMProviderPort
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.skills.menu_import.draft_schema import ImportDraft
from app.modules.assistant.skills.menu_import.extraction_prompt import build_modeling_prompt


def _collect_chat_json(provider: LLMProviderPort, request: ChatCompletionRequest) -> dict[str, Any]:
    content = ""
    for event in provider.stream_chat(request):
        if event.event == "message.complete":
            content = (event.data.get("content") or "").strip()
            break
    if not content:
        return {}
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def model_import_draft(
    literal: ImportDraft,
    context: dict[str, Any],
    *,
    llm: LLMProviderPort | None = None,
) -> ImportDraft:
    """Restructure literal OCR output using owner context and default modeling rules."""
    if not literal.categories and not literal.promotions and not literal.global_rules:
        return literal

    provider = llm or build_llm_provider()
    prompt = build_modeling_prompt(context)
    literal_json = json.dumps(literal.model_dump(), ensure_ascii=False, indent=2)
    data = _collect_chat_json(
        provider,
        ChatCompletionRequest(
            messages=[
                ChatCompletionMessage(role="system", content=prompt),
                ChatCompletionMessage(
                    role="user",
                    content=f"Literal OCR draft:\n\n{literal_json}",
                ),
            ],
            response_format="json_object",
        ),
    )
    if not data:
        return literal
    return ImportDraft.model_validate(data)
