"""Assign uploaded product photos to menu products (single and bulk)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.infra.storage.factory import build_storage
from app.modules.assistant.import_asset_paths import resolve_product_image_path
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.context import AgentContext
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
from app.modules.menu.schemas import ProductDTO, ProductUpdate
from app.modules.menu.service import MenuService


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
        final_image_path = resolve_product_image_path(
            build_storage(),
            ctx.restaurant_id,
            storage_path,
        )
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
            ProductUpdate(image_path=final_image_path),
        )
    except (ValidationError, NotFoundError, ConflictError) as exc:
        return BulkRowResult(id=str(product_id), ok=False, error=str(exc))

    invalidate(ctx)
    return BulkRowResult(
        id=str(product_id),
        ok=True,
        label=updated.name,
        changed_fields=["image_path"],
        image_path=updated.image_path,
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
            data={"product_id": result.id, "image_path": result.image_path},
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


def _remove_product_image_row(
    menu: MenuService,
    ctx: AgentContext,
    *,
    item: dict[str, Any],
    invalidate: Callable[[AgentContext], None],
) -> BulkRowResult:
    product_id, resolve_err = _resolve_product_id(menu, ctx, item)
    if resolve_err or product_id is None:
        return BulkRowResult(id="?", ok=False, error=resolve_err or "Product not found")

    try:
        product = menu.get_product(ctx.restaurant_id, product_id)
    except NotFoundError:
        return BulkRowResult(id=str(product_id), ok=False, error="Product not found")

    if not product.image_path:
        return BulkRowResult(
            id=str(product_id),
            ok=True,
            label=product.name,
            changed_fields=[],
        )

    try:
        updated = menu.update_product(
            ctx.restaurant_id,
            product_id,
            ProductUpdate(image_path=None),
        )
    except (ValidationError, NotFoundError, ConflictError) as exc:
        return BulkRowResult(id=str(product_id), ok=False, error=str(exc))

    invalidate(ctx)
    return BulkRowResult(
        id=str(product_id),
        ok=True,
        label=updated.name,
        changed_fields=["image_path"],
        image_path=None,
    )


def remove_product_image(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    result = _remove_product_image_row(menu, ctx, item=args, invalidate=invalidate)
    if not result.ok:
        return ToolResult(ok=False, summary=result.error or "Failed to remove product image")
    if not result.changed_fields:
        return ToolResult(
            ok=True,
            summary=f"Product {result.label!r} already had no image",
            data={"product_id": result.id, "image_path": None},
        )
    return ToolResult(
        ok=True,
        summary=f"Removed image from {result.label!r}",
        data={"product_id": result.id, "image_path": None},
    )


def bulk_remove_product_images(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw_items = _resolve_items_arg(args, "items", "products")
    items, err = _parse_items(raw_items, max_items=BULK_DEFAULT_LIMIT, entity_label="product")
    if err:
        return ToolResult(ok=False, summary=err)

    results = [
        _remove_product_image_row(menu, ctx, item=item, invalidate=invalidate)
        for item in items
    ]
    return bulk_tool_result(entity_label="product image", results=results, verb="Removed")


def product_has_custom_image(product: ProductDTO) -> bool:
    return bool((product.image_path or "").strip())
