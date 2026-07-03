"""Preview and apply LLM-generated description enhancements for imported products."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.core.exceptions import ValidationError
from app.core.llm.ports import ChatCompletionMessage, ChatCompletionRequest, LLMProviderPort
from app.db.models.menu_import_session import MenuImportSession
from app.infra.llm.factory import build_llm_provider
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_write.bulk import bulk_update_product_descriptions
from app.modules.assistant.skills.base import ToolResult
from app.modules.menu.service import MenuService


@dataclass(frozen=True, slots=True)
class DescriptionEnhancement:
    product_id: str
    current: str | None
    proposed: str


def _accumulated_product_ref_map(draft_batches: list[Any]) -> dict[str, uuid.UUID]:
    merged: dict[str, uuid.UUID] = {}
    for entry in draft_batches:
        if not isinstance(entry, dict) or not entry.get("applied_at"):
            continue
        raw_map = entry.get("ref_map") or {}
        if not isinstance(raw_map, dict):
            continue
        for ref, value in raw_map.items():
            if not str(ref).startswith("prod_"):
                continue
            try:
                merged[str(ref)] = uuid.UUID(str(value))
            except (TypeError, ValueError):
                continue
    return merged


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


def _build_enhance_prompt(products: list[dict[str, Any]], discovery: dict[str, Any]) -> str:
    lines = []
    for product in products:
        lines.append(
            f'- id={product["id"]!r} name={product["name"]!r} '
            f'current_description={product.get("description")!r}'
        )
    catalog = "\n".join(lines)
    discovery_block = json.dumps(discovery, ensure_ascii=False, indent=2)
    return f"""Improve restaurant menu product descriptions for a digital menu.

Discovery context:
{discovery_block}

Products:
{catalog}

Return strict JSON:
{{
  "enhancements": [
    {{
      "product_id": "uuid string",
      "proposed": "improved description in Spanish, concise and appetizing"
    }}
  ]
}}

Rules:
- Keep factual accuracy; do not invent ingredients not implied by the name/current text.
- One enhancement per product_id provided.
- Write proposed descriptions in Spanish.
"""


def preview_description_enhancements(
    session: MenuImportSession,
    ctx: AgentContext,
    *,
    llm: LLMProviderPort | None = None,
) -> list[DescriptionEnhancement]:
    ref_map = _accumulated_product_ref_map(session.draft_batches or [])
    if not ref_map:
        raise ValidationError("Apply at least one batch before enhancing descriptions")

    menu = MenuService(ctx.uow.menu)
    products_payload: list[dict[str, Any]] = []
    current_by_id: dict[str, str | None] = {}
    for product_id in ref_map.values():
        product = menu.get_product_by_id(ctx.restaurant_id, product_id)
        product_id_str = str(product.id)
        current_by_id[product_id_str] = product.description
        products_payload.append(
            {
                "id": product_id_str,
                "name": product.name,
                "description": product.description,
            }
        )

    provider = llm or build_llm_provider()
    data = _collect_chat_json(
        provider,
        ChatCompletionRequest(
            messages=[
                ChatCompletionMessage(
                    role="system",
                    content=_build_enhance_prompt(
                        products_payload,
                        session.discovery_answers or {},
                    ),
                ),
                ChatCompletionMessage(
                    role="user",
                    content="Generate improved descriptions for all listed products.",
                ),
            ],
            response_format="json_object",
        ),
    )

    enhancements: list[DescriptionEnhancement] = []
    raw_items = data.get("enhancements") or []
    if not isinstance(raw_items, list):
        return enhancements

    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        product_id = str(entry.get("product_id") or "").strip()
        proposed = str(entry.get("proposed") or "").strip()
        if not product_id or not proposed:
            continue
        if product_id not in current_by_id:
            continue
        enhancements.append(
            DescriptionEnhancement(
                product_id=product_id,
                current=current_by_id[product_id],
                proposed=proposed,
            )
        )
    return enhancements


def apply_description_enhancements(
    session: MenuImportSession,
    ctx: AgentContext,
    *,
    confirmed: bool,
    enhancements: list[DescriptionEnhancement] | None = None,
    llm: LLMProviderPort | None = None,
) -> ToolResult:
    if not confirmed:
        return ToolResult(ok=False, summary="confirmed=true is required to apply description enhancements")

    items = enhancements
    if items is None:
        items = preview_description_enhancements(session, ctx, llm=llm)
    if not items:
        return ToolResult(ok=False, summary="No description enhancements to apply")

    menu = MenuService(ctx.uow.menu)

    def _invalidate(agent_ctx: AgentContext) -> None:
        invalidate_restaurant_menu_cache(agent_ctx.uow, agent_ctx.restaurant_id)

    payload = {
        "items": [
            {"product_id": item.product_id, "description": item.proposed}
            for item in items
        ]
    }
    return bulk_update_product_descriptions(menu, ctx, payload, invalidate=_invalidate)
