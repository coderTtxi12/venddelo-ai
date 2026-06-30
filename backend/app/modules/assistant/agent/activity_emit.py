"""Human-readable agent activity payloads for SSE (thoughts, plans, phases)."""

from __future__ import annotations

import json
from typing import Any

from app.modules.assistant.agent.response_format import LOAD_SKILL_TOOL_NAME, parse_function_name
from app.modules.assistant.entitlements.catalog import SKILL_CATALOG

_TOOL_GOALS: dict[str, str] = {
    "load_skill": "Cargar guía de skill",
    "list_categories": "Listar categorías del menú",
    "list_products": "Listar productos del menú",
    "search_products": "Buscar productos",
    "get_product": "Obtener detalle de producto",
    "list_promotions": "Listar promociones",
    "get_promotion": "Obtener detalle de promoción",
    "list_product_promotions": "Revisar promos del producto",
    "update_product": "Actualizar producto",
    "create_product": "Crear producto",
    "bulk_update_product_names": "Renombrar productos en lote",
    "bulk_update_product_descriptions": "Actualizar descripciones en lote",
    "bulk_update_product_prices": "Actualizar precios en lote",
    "update_category": "Actualizar categoría",
    "create_category": "Crear categoría",
}


def _skill_label(skill_id: str | None) -> str:
    if not skill_id:
        return ""
    definition = SKILL_CATALOG.get(skill_id)
    return definition.label if definition else skill_id


def resolve_tool_identity(fn_name: str) -> tuple[str | None, str]:
    if fn_name == LOAD_SKILL_TOOL_NAME:
        return None, LOAD_SKILL_TOOL_NAME
    return parse_function_name(fn_name)


def phase_for_effect(effect: str | None) -> str:
    if effect == "mutate":
        return "execute"
    return "explore"


def goal_for_call(fn_name: str, args: dict[str, Any]) -> str:
    """Short Spanish label for plan step goals."""
    _skill_id, tool_name = resolve_tool_identity(fn_name)
    base = _TOOL_GOALS.get(tool_name, tool_name.replace("_", " "))

    if tool_name == LOAD_SKILL_TOOL_NAME:
        skill_id = args.get("skill_id")
        if isinstance(skill_id, str) and skill_id:
            return f"{base}: {_skill_label(skill_id)}"
        return base

    if tool_name == "search_products":
        query = args.get("query") or args.get("name")
        if isinstance(query, str) and query.strip():
            return f'{base} «{query.strip()}»'
    if tool_name in {"get_product", "update_product"}:
        for key in ("name", "product_name", "query"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return f'{base}: «{value.strip()}»'
        product_id = args.get("product_id")
        if isinstance(product_id, str) and product_id:
            return f"{base} (id …{product_id[-6:]})"
    if tool_name.startswith("bulk_update_product"):
        items = args.get("items") or args.get("products")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} producto{'s' if count != 1 else ''})"

    return base


def normalize_llm_reasoning(text: str | None, *, max_sentences: int = 2) -> str | None:
    """Keep the model's owner-facing reasoning (1–2 sentences in Spanish)."""
    if not text or not text.strip():
        return None
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return None
    sentences: list[str] = []
    buffer = ""
    for char in cleaned:
        buffer += char
        if char in ".!?":
            sentence = buffer.strip()
            if sentence:
                sentences.append(sentence)
            buffer = ""
            if len(sentences) >= max_sentences:
                break
    if len(sentences) < max_sentences and buffer.strip():
        sentences.append(buffer.strip())
    if not sentences:
        return cleaned
    return " ".join(sentences[:max_sentences])


def plan_steps_for_calls(
    calls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for index, call in enumerate(calls, start=1):
        function = call.get("function") or {}
        fn_name = function.get("name") or ""
        raw_args = function.get("arguments") or "{}"
        try:
            args = json.loads(raw_args) if raw_args else {}
        except (json.JSONDecodeError, TypeError):
            args = {}
        if not isinstance(args, dict):
            args = {}
        steps.append(
            {
                "id": index,
                "goal": goal_for_call(fn_name, args),
                "tool_hint": fn_name,
                "status": "pending",
            }
        )
    return steps


def mark_plan_step_done(
    steps: list[dict[str, Any]], step_index: int
) -> list[dict[str, Any]]:
    updated: list[dict[str, Any]] = []
    for item in steps:
        row = dict(item)
        row_id = row.get("id")
        if row_id == step_index:
            row["status"] = "done"
        updated.append(row)
    return updated
