"""Assign uploaded product photos to menu products (single, bulk, vision match)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.config import get_settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import PaginationParams
from app.core.storage import StorageError
from app.core.vision.ports import VisionAnalysisRequest, VisionError, VisionPort
from app.infra.storage.factory import build_storage
from app.infra.vision.factory import build_vision_provider
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.menu_intelligence.image_loader import product_image_media_type
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    BulkRowResult,
    _parse_items,
    _resolve_items_arg,
    _resolve_product_id,
    bulk_tool_result,
)
from app.modules.assistant.skills.menu_write.product_image_paths import (
    validate_product_image_storage_path,
)
from app.modules.assistant.skills.menu_write.product_photo_prompt import (
    build_product_photo_match_prompt,
)
from app.modules.menu.schemas import ProductDTO, ProductUpdate
from app.modules.menu.service import MenuService

UNCERTAIN_MIN_CONFIDENCE = 0.30
_PRODUCT_SCAN_PAGE_SIZE = 200


@dataclass(frozen=True, slots=True)
class ProductPhotoMatchResult:
    matched: list[dict[str, Any]] = field(default_factory=list)
    uncertain: list[dict[str, Any]] = field(default_factory=list)
    unmatched: list[dict[str, Any]] = field(default_factory=list)


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _storage_path_from_item(item: dict[str, Any]) -> str | None:
    for key in ("storage_path", "image_path", "path"):
        value = _optional_str(item.get(key))
        if value:
            return value
    return None


def _load_image_bytes(path: str) -> tuple[bytes, str]:
    storage = build_storage()
    try:
        data = storage.read(path)
    except StorageError as exc:
        raise ValidationError(f"Could not read image at {path}") from exc
    return data, product_image_media_type(path)


def _live_product_catalog(menu: MenuService, ctx: AgentContext) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        page = menu.list_products(
            ctx.restaurant_id,
            PaginationParams(limit=_PRODUCT_SCAN_PAGE_SIZE, cursor=cursor),
        )
        for product in page.items:
            catalog.append(
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "description": product.description,
                }
            )
        if not page.has_more:
            break
        cursor = page.next_cursor
    return catalog


def _classify_photo_match(
    *,
    image_path: str,
    analysis: dict[str, Any],
    threshold: float,
) -> tuple[str, dict[str, Any]]:
    product_id = analysis.get("product_id") or analysis.get("product_ref")
    if product_id is not None:
        product_id = str(product_id).strip() or None

    confidence_raw = analysis.get("confidence", 0.0)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.0

    reason_es = str(analysis.get("reason_es") or "").strip()

    if product_id and confidence >= threshold:
        return "matched", {
            "image_path": image_path,
            "product_id": product_id,
            "confidence": round(confidence, 3),
            "reason_es": reason_es,
        }

    candidates_raw = analysis.get("candidates") or []
    candidates: list[dict[str, Any]] = []
    if isinstance(candidates_raw, list):
        for entry in candidates_raw[:3]:
            if not isinstance(entry, dict):
                continue
            cand_id = entry.get("product_id") or entry.get("product_ref")
            if not cand_id:
                continue
            try:
                cand_conf = float(entry.get("confidence", 0.0))
            except (TypeError, ValueError):
                cand_conf = 0.0
            candidates.append(
                {
                    "product_id": str(cand_id),
                    "confidence": round(cand_conf, 3),
                    "reason_es": str(entry.get("reason_es") or "").strip(),
                }
            )

    if candidates or (product_id and confidence >= UNCERTAIN_MIN_CONFIDENCE):
        if product_id and not candidates:
            candidates = [
                {
                    "product_id": product_id,
                    "confidence": round(confidence, 3),
                    "reason_es": reason_es,
                }
            ]
        return "uncertain", {
            "image_path": image_path,
            "candidates": candidates,
            "reason_es": reason_es or "Coincidencia incierta; elige el producto correcto.",
        }

    return "unmatched", {
        "image_path": image_path,
        "reason_es": reason_es or "No se encontró un producto coincidente.",
    }


def _assign_product_image_row(
    menu: MenuService,
    ctx: AgentContext,
    *,
    item: dict[str, Any],
    invalidate: Callable[[AgentContext], None],
    force: bool,
) -> BulkRowResult:
    storage_path = _storage_path_from_item(item)
    if not storage_path:
        return BulkRowResult(id="?", ok=False, error="storage_path or image_path is required")

    try:
        validate_product_image_storage_path(ctx.restaurant_id, storage_path)
    except ValidationError as exc:
        return BulkRowResult(id=storage_path, ok=False, error=str(exc))

    product_id, resolve_err = _resolve_product_id(menu, ctx, item)
    if resolve_err or product_id is None:
        return BulkRowResult(id=storage_path, ok=False, error=resolve_err or "Product not found")

    row_force = force or bool(item.get("force", False))
    try:
        product = menu.get_product(ctx.restaurant_id, product_id)
    except NotFoundError:
        return BulkRowResult(id=str(product_id), ok=False, error="Product not found")

    if product.image_path and not row_force:
        return BulkRowResult(
            id=str(product_id),
            ok=False,
            error=(
                f"Product {product.name!r} already has an image; "
                "pass force=true on the row or tool to replace"
            ),
        )

    try:
        updated = menu.update_product(
            ctx.restaurant_id,
            product_id,
            ProductUpdate(image_path=storage_path),
        )
    except (ValidationError, NotFoundError, ConflictError) as exc:
        return BulkRowResult(id=str(product_id), ok=False, error=str(exc))

    invalidate(ctx)
    return BulkRowResult(
        id=str(product_id),
        ok=True,
        label=updated.name,
        changed_fields=["image_path"],
    )


def assign_product_image(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    result = _assign_product_image_row(
        menu,
        ctx,
        item=args,
        invalidate=invalidate,
        force=bool(args.get("force", False)),
    )
    if result.ok:
        return ToolResult(
            ok=True,
            summary=f"Assigned photo to {result.label!r}",
            data={"product_id": result.id, "image_path": _storage_path_from_item(args)},
        )
    return ToolResult(ok=False, summary=result.error or "Failed to assign product image")


def bulk_assign_product_images(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw_items = _resolve_items_arg(args, "items", "photos", "mappings")
    items, err = _parse_items(raw_items, max_items=BULK_DEFAULT_LIMIT, entity_label="photo mapping")
    if err:
        return ToolResult(ok=False, summary=err)

    force = bool(args.get("force", False))
    results = [
        _assign_product_image_row(menu, ctx, item=item, invalidate=invalidate, force=force)
        for item in items
    ]
    return bulk_tool_result(entity_label="product photo", results=results, verb="Assigned")


def match_product_photos(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    vision: VisionPort | None = None,
) -> ToolResult:
    raw_paths = args.get("image_paths") or args.get("storage_paths") or args.get("paths")
    if raw_paths is None:
        return ToolResult(ok=False, summary="image_paths must be a non-empty list")
    if not isinstance(raw_paths, list) or not raw_paths:
        return ToolResult(ok=False, summary="image_paths must be a non-empty list")
    if len(raw_paths) > BULK_DEFAULT_LIMIT:
        return ToolResult(
            ok=False,
            summary=f"At most {BULK_DEFAULT_LIMIT} image_paths per call (got {len(raw_paths)})",
        )

    catalog = _live_product_catalog(menu, ctx)
    if not catalog:
        return ToolResult(ok=False, summary="No products in menu to match photos against")

    original_names = args.get("original_names")
    name_by_path: dict[str, str] = {}
    if isinstance(original_names, dict):
        for key, value in original_names.items():
            label = _optional_str(value)
            if label:
                name_by_path[str(key).strip()] = label

    provider = vision or build_vision_provider()
    threshold = get_settings().menu_import_photo_match_confidence_threshold

    matched: list[dict[str, Any]] = []
    uncertain: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []

    for raw_path in raw_paths:
        image_path = _optional_str(raw_path)
        if not image_path:
            unmatched.append({"image_path": "?", "reason_es": "Empty image path"})
            continue
        try:
            validate_product_image_storage_path(ctx.restaurant_id, image_path)
            image_bytes, media_type = _load_image_bytes(image_path)
        except ValidationError as exc:
            unmatched.append({"image_path": image_path, "reason_es": str(exc)})
            continue

        prompt = build_product_photo_match_prompt(
            catalog,
            image_path=image_path,
            original_name=name_by_path.get(image_path),
        )
        try:
            result = provider.analyze_json(
                VisionAnalysisRequest(
                    prompt=prompt,
                    image_bytes=image_bytes,
                    image_media_type=media_type,
                )
            )
        except VisionError as exc:
            unmatched.append(
                {"image_path": image_path, "reason_es": f"Error de visión: {exc}"}
            )
            continue

        classification, payload = _classify_photo_match(
            image_path=image_path,
            analysis=result.data,
            threshold=threshold,
        )
        if classification == "matched":
            matched.append(payload)
        elif classification == "uncertain":
            uncertain.append(payload)
        else:
            unmatched.append(payload)

    summary_parts = [
        f"{len(matched)} matched",
        f"{len(uncertain)} uncertain",
        f"{len(unmatched)} unmatched",
    ]
    return ToolResult(
        ok=True,
        summary=f"Photo match: {', '.join(summary_parts)}",
        data={
            "matched": matched,
            "uncertain": uncertain,
            "unmatched": unmatched,
        },
    )


def product_has_custom_image(product: ProductDTO) -> bool:
    return bool((product.image_path or "").strip())
