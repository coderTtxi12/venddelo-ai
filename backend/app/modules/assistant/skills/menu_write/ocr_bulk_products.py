"""OCR uploaded menu images into bulk_create_products-compatible payloads."""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.core.storage import StorageError, StoragePort
from app.core.vision.ports import VisionAnalysisRequest, VisionError, VisionPort
from app.infra.storage.factory import build_storage
from app.infra.vision.factory import build_vision_provider
from app.modules.assistant.import_asset_paths import validate_assignable_image_path
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_intelligence.image_loader import product_image_media_type

OCR_BULK_MAX_PATHS = 5


def build_bulk_products_ocr_prompt() -> str:
    """Return instructions for extracting menu items from one image."""
    return """
Read this restaurant menu image and return only a JSON object.
Extract every visible menu product accurately; do not invent products, prices, categories,
descriptions, or options that are not shown. If a value is unclear or absent, omit it.
Menu prices are MXN pesos: set price_cents to the listed pesos × 100. Model each visible
size, variant, or guisado as an option_groups entry.
Return category_names, never category_ids.

Example:
{
  "items": [
    {
      "name": "Taco al pastor",
      "price_cents": 2500,
      "category_names": ["Tacos"],
      "description": "Con piña y cilantro",
      "option_groups": [
        {
          "title": "Extras",
          "selection": "multi",
          "required": false,
          "items": [
            { "label": "Queso", "price_delta_cents": 1000 },
            { "label": "Guacamole", "price_delta_cents": 1500 }
          ]
        },
        {
          "title": "Tamaño",
          "selection": "single",
          "required": true,
          "max_selections": 1,
          "items": [
            { "label": "Normal", "price_delta_cents": 0 },
            { "label": "Doble", "price_delta_cents": 2000 }
          ]
        }
      ]
    }
  ]
}
""".strip()


def _coerce_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        number = value
    elif isinstance(value, float):
        if not value.is_integer():
            return default
        number = int(value)
    elif isinstance(value, str) and value.isdigit():
        number = int(value)
    else:
        return default
    return number if number >= 0 else default


def _nonempty_strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text for entry in value if (text := str(entry).strip())]


def _normalize_option_items(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    items: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label") or "").strip()
        if not label:
            continue
        item: dict[str, Any] = {
            "label": label,
            "price_delta_cents": _coerce_int(
                entry.get(
                    "price_delta_cents",
                    entry.get("pricedeltacents", entry.get("priceDeltaCents", 0)),
                )
            ),
        }
        if "sort_index" in entry:
            item["sort_index"] = _coerce_int(entry["sort_index"])
        items.append(item)
    return items


def _normalize_option_groups(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    groups: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "").strip()
        if not title:
            continue
        selection = str(entry.get("selection") or "").strip()
        if selection not in {"single", "multi"}:
            selection = "single"
        group: dict[str, Any] = {"title": title, "selection": selection}
        for field in ("required",):
            if field in entry and isinstance(entry[field], bool):
                group[field] = entry[field]
        for field in ("min_selections", "max_selections", "sort_index"):
            if field in entry:
                group[field] = _coerce_int(entry[field])
        items = _normalize_option_items(entry.get("items"))
        if items:
            group["items"] = items
        groups.append(group)
    return groups


def _normalize_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    price = raw.get("price_cents", raw.get("pricecents", raw.get("priceCents", 0)))
    item: dict[str, Any] = {"name": name, "price_cents": _coerce_int(price)}
    for field in ("description", "currency", "status"):
        value = str(raw.get(field) or "").strip()
        if value:
            item[field] = value
    category_names = _nonempty_strings(raw.get("category_names"))
    if category_names:
        item["category_names"] = category_names
    option_groups = _normalize_option_groups(raw.get("option_groups"))
    if option_groups:
        item["option_groups"] = option_groups
    return item


def normalize_bulk_product_items(raw: Any) -> list[dict[str, Any]]:
    """Normalize JSON vision output to the bulk_create_products item shape."""
    candidates = raw.get("items") if isinstance(raw, dict) else raw
    if not isinstance(candidates, list):
        return []
    return [
        item
        for entry in candidates
        if isinstance(entry, dict) and (item := _normalize_item(entry))
    ]


def _resolve_paths(args: dict[str, Any]) -> list[str]:
    paths = args.get("storage_paths")
    if paths is None:
        paths = [args["storage_path"]] if args.get("storage_path") is not None else []
    if not isinstance(paths, list):
        return []
    return [str(path).strip() for path in paths if str(path).strip()]


def _media_type(path: str) -> str:
    return product_image_media_type(path)


def _dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        categories = item.get("category_names")
        first_category = categories[0] if isinstance(categories, list) and categories else ""
        key = (str(item["name"]).casefold(), str(first_category).casefold())
        if key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped


def ocr_menu_to_bulk_products(
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    vision: VisionPort | None = None,
    storage: StoragePort | None = None,
) -> ToolResult:
    """Extract draft bulk-product rows from one to five authorized image paths."""
    paths = _resolve_paths(args)
    if not paths:
        return ToolResult(ok=False, summary="Provide at least one storage_path")
    if len(paths) > OCR_BULK_MAX_PATHS:
        return ToolResult(
            ok=False,
            summary=f"Provide at most {OCR_BULK_MAX_PATHS} image paths",
        )

    provider = vision or build_vision_provider()
    object_storage = storage or build_storage()
    prompt = build_bulk_products_ocr_prompt()
    model = get_settings().openai_vision_model
    items: list[dict[str, Any]] = []
    failed_paths: list[dict[str, str]] = []

    for path in paths:
        try:
            validate_assignable_image_path(ctx.restaurant_id, path)
            image_bytes = object_storage.read(path)
            result = provider.analyze_json(
                VisionAnalysisRequest(
                    prompt=prompt,
                    image_bytes=image_bytes,
                    image_media_type=_media_type(path),
                    model=model,
                )
            )
        except (ValidationError, StorageError, VisionError) as exc:
            failed_paths.append({"storage_path": path, "error": str(exc)})
            continue
        items.extend(normalize_bulk_product_items(result.data))

    deduped = _dedupe_items(items)
    data = {
        "items": deduped,
        "item_count": len(deduped),
        "source_count": len(paths),
        "failed_paths": failed_paths,
        "model": model,
    }
    if not deduped:
        return ToolResult(
            ok=False,
            summary="No products could be extracted from the images",
            data=data,
        )
    return ToolResult(
        ok=True,
        summary=f"Extracted {len(deduped)} product(s) from {len(paths)} image(s)",
        data=data,
    )
