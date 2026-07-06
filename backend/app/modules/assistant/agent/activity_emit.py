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
    "create_promotion": "Crear promoción",
    "update_promotion": "Actualizar promoción",
    "set_promotion_targets": "Asignar productos a promoción",
    "disable_promotion": "Desactivar promoción",
    "generate_promotion_banner": "Generar banner de promoción",
    "update_product": "Actualizar producto",
    "create_product": "Crear producto",
    "bulk_update_product_names": "Renombrar productos en lote",
    "bulk_update_product_descriptions": "Actualizar descripciones en lote",
    "bulk_update_product_prices": "Actualizar precios en lote",
    "bulk_update_category_names": "Renombrar categorías en lote",
    "bulk_update_category_descriptions": "Actualizar descripciones de categorías en lote",
    "bulk_update_category_sort_indices": "Reordenar categorías en lote",
    "bulk_update_category_visibility": "Cambiar visibilidad de categorías en lote",
    "bulk_update_category_display_layout": "Cambiar layout de categorías en lote",
    "bulk_update_option_item_visibility": "Cambiar visibilidad de complementos en lote",
    "bulk_update_option_item_labels": "Renombrar complementos en lote",
    "bulk_update_option_item_prices": "Actualizar precios de complementos en lote",
    "bulk_add_option_items": "Agregar complementos en lote",
    "bulk_add_option_groups": "Agregar grupos de complementos en lote",
    "delete_option_item": "Eliminar complemento",
    "bulk_delete_option_items": "Eliminar complementos en lote",
    "generate_product_image": "Generar foto de producto",
    "analyze_product_image": "Analizar foto del producto",
    "suggest_complements": "Sugerir complementos",
    "start_menu_import_session": "Iniciar importación de menú",
    "get_import_session": "Consultar sesión de importación",
    "save_discovery_answers": "Guardar respuestas de descubrimiento",
    "register_menu_source_file": "Registrar archivo del menú",
    "start_menu_extraction_batch": "Extraer contenido del menú (OCR)",
    "get_extraction_status": "Consultar estado de extracción",
    "save_clarification_answers": "Guardar aclaraciones del menú",
    "optimize_import_draft": "Optimizar menú y complementos",
    "preview_full_import": "Vista previa del menú completo",
    "apply_full_import": "Publicar menú completo",
    "list_menu_themes": "Listar temas del menú digital",
    "get_current_menu_theme": "Consultar tema actual del menú",
    "recommend_menu_theme": "Recomendar tema visual",
    "apply_menu_theme": "Aplicar tema del menú",
    "assign_product_image": "Asignar foto a producto",
    "bulk_assign_product_images": "Asignar fotos en lote",
    "match_product_photos": "Emparejar fotos con productos",
    "preview_import_batch": "Vista previa del lote de importación",
    "apply_menu_batch": "Aplicar lote al menú digital",
    "preview_description_enhancements": "Vista previa de descripciones mejoradas",
    "apply_description_enhancements": "Aplicar descripciones mejoradas",
    "request_image_enhancement": "Listar productos sin foto",
    "update_menu_knowledge": "Actualizar conocimiento del menú",
    "update_category": "Actualizar categoría",
    "create_category": "Crear categoría",
    "set_product_option_group_order": "Reordenar grupos de complementos",
    "set_option_group_item_order": "Reordenar complementos en grupo",
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
    if tool_name in {"get_product", "update_product", "generate_product_image", "analyze_product_image", "suggest_complements"}:
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
    if tool_name.startswith("bulk_update_category"):
        items = args.get("items") or args.get("categories")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} categoría{'s' if count != 1 else ''})"
    if tool_name.startswith("bulk_update_option_item"):
        items = args.get("items") or args.get("option_items")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} complemento{'s' if count != 1 else ''})"
    if tool_name.startswith("bulk_add_option_item"):
        items = args.get("items") or args.get("option_items")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} complemento{'s' if count != 1 else ''})"
    if tool_name.startswith("bulk_delete_option_item"):
        items = args.get("items") or args.get("option_items")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} complemento{'s' if count != 1 else ''})"
    if tool_name == "delete_option_item":
        label = args.get("expected_label") or args.get("label")
        if isinstance(label, str) and label.strip():
            return f'{base}: «{label.strip()}»'
    if tool_name == "bulk_update_option_item_visibility":
        match_label = args.get("match_label") or args.get("complement_label")
        if isinstance(match_label, str) and match_label.strip():
            return f'{base}: «{match_label.strip()}» en todo el menú'
    if tool_name == "bulk_add_option_groups":
        items = args.get("items") or args.get("groups") or args.get("option_groups")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} grupo{'s' if count != 1 else ''})"
    if tool_name.startswith("bulk_assign_product_image"):
        items = args.get("items") or args.get("photos") or args.get("mappings")
        count = len(items) if isinstance(items, list) else 0
        if count:
            return f"{base} ({count} foto{'s' if count != 1 else ''})"
    if tool_name == "match_product_photos":
        paths = args.get("image_paths") or args.get("storage_paths") or args.get("paths")
        count = len(paths) if isinstance(paths, list) else 0
        if count:
            return f"{base} ({count} foto{'s' if count != 1 else ''})"
    if tool_name in {"preview_import_batch", "apply_menu_batch"}:
        batch_index = args.get("batch_index")
        if isinstance(batch_index, int):
            return f"{base} (lote {batch_index})"
    if tool_name in {"get_promotion", "update_promotion", "set_promotion_targets", "disable_promotion"}:
        for key in ("name", "promotion_name", "query"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return f'{base}: «{value.strip()}»'
        promotion_id = args.get("promotion_id")
        if isinstance(promotion_id, str) and promotion_id:
            return f"{base} (id …{promotion_id[-6:]})"
    if tool_name == "create_promotion":
        name = args.get("name")
        if isinstance(name, str) and name.strip():
            return f'{base}: «{name.strip()}»'
    if tool_name == "generate_promotion_banner":
        for key in ("name", "promotion_name"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return f'{base}: «{value.strip()}»'
    if tool_name in {"register_menu_source_file", "assign_product_image"}:
        name = args.get("original_name") or args.get("storage_path")
        if isinstance(name, str) and name.strip():
            short = name.strip().rsplit("/", 1)[-1]
            return f"{base}: «{short}»"

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
