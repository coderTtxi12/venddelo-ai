"""Bulk create categories and products for menu_write."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import PaginationParams
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    BulkRowResult,
    _parse_items,
    _parse_uuid,
    _resolve_items_arg,
    bulk_tool_result,
)
from app.modules.assistant.skills.menu_write.option_item_bulk import _parse_nested_option_items
from app.modules.menu.schemas import CategoryCreate, OptionGroupCreate, ProductCreate
from app.modules.menu.service import MenuService


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def bulk_create_categories(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "categories")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="category")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        name = _optional_str(item.get("name"))
        if not name:
            results.append(BulkRowResult(id="?", ok=False, error="name is required"))
            continue
        try:
            sort_index = int(item.get("sort_index", 0) or 0)
            created = menu.create_category(
                CategoryCreate(
                    restaurant_id=ctx.restaurant_id,
                    name=name,
                    description=_optional_str(item.get("description")),
                    sort_index=sort_index,
                )
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=str(created.id),
                    ok=True,
                    label=created.name,
                    changed_fields=["name"],
                )
            )
        except (ValidationError, NotFoundError, ConflictError, TypeError, ValueError) as exc:
            results.append(BulkRowResult(id="?", ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="category", results=results, verb="Added")


def _resolve_row_category_ids(
    menu: MenuService,
    ctx: AgentContext,
    item: dict[str, Any],
) -> tuple[list[uuid.UUID], str | None]:
    """Resolve optional category_ids and/or category_names for one product row."""
    category_ids: list[uuid.UUID] = []
    raw_ids = item.get("category_ids")
    if raw_ids is not None:
        if not isinstance(raw_ids, list):
            return [], "category_ids must be a list"
        for entry in raw_ids:
            parsed = _parse_uuid(entry)
            if parsed is None:
                return [], f"Invalid category_id: {entry!r}"
            category_ids.append(parsed)

    names = item.get("category_names")
    if names is None:
        return category_ids, None
    if not isinstance(names, list):
        return [], "category_names must be a list"
    if not names and raw_ids is None:
        return category_ids, None

    page = menu.list_all_categories(
        ctx.restaurant_id,
        PaginationParams(limit=200, cursor=None),
    )
    for name in names:
        label = _optional_str(name)
        if not label:
            return [], "Each category_names entry must be a string"
        matches = [
            category for category in page.items if category.name.casefold() == label.casefold()
        ]
        if len(matches) != 1:
            if len(matches) > 1:
                labels = ", ".join(category.name for category in matches[:5])
                return [], f"Ambiguous category name {label!r}; candidates: {labels}"
            return [], f"Category not found for name {label!r}"
        if matches[0].id not in category_ids:
            category_ids.append(matches[0].id)
    return category_ids, None


def _parse_row_option_groups(raw: Any) -> tuple[list[OptionGroupCreate], str | None]:
    if raw is None:
        return [], None
    if not isinstance(raw, list):
        return [], "option_groups must be a list"

    groups: list[OptionGroupCreate] = []
    for entry in raw:
        if not isinstance(entry, dict):
            return [], "Each option_groups entry must be an object"
        title = _optional_str(entry.get("title"))
        if not title:
            return [], "Each option group requires a title"
        nested_items, nested_err = _parse_nested_option_items(entry.get("items"))
        if nested_err:
            return [], nested_err
        selection = str(entry.get("selection") or "single")
        if selection not in {"single", "multi"}:
            return [], "selection must be single or multi"
        try:
            max_selections = (
                int(entry["max_selections"]) if entry.get("max_selections") is not None else None
            )
            groups.append(
                OptionGroupCreate(
                    title=title,
                    required=bool(entry.get("required", False)),
                    selection=selection,
                    min_selections=int(entry.get("min_selections", 0) or 0),
                    max_selections=max_selections,
                    sort_index=int(entry.get("sort_index", 0) or 0),
                    items=nested_items,
                )
            )
        except (TypeError, ValueError) as exc:
            return [], str(exc)
    return groups, None


def bulk_create_products(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "products")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="product")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        name = _optional_str(item.get("name"))
        if not name:
            results.append(BulkRowResult(id="?", ok=False, error="name is required"))
            continue

        category_ids, category_err = _resolve_row_category_ids(menu, ctx, item)
        if category_err:
            results.append(BulkRowResult(id="?", ok=False, error=category_err))
            continue

        option_groups, groups_err = _parse_row_option_groups(item.get("option_groups"))
        if groups_err:
            results.append(BulkRowResult(id="?", ok=False, error=groups_err))
            continue

        try:
            price_raw = item.get("price_cents", 0)
            price_cents = int(0 if price_raw is None else price_raw)
            if price_cents < 0:
                results.append(BulkRowResult(id="?", ok=False, error="price_cents must be >= 0"))
                continue
            status = str(item.get("status") or "active")
            if status not in {"active", "inactive", "draft"}:
                results.append(BulkRowResult(id="?", ok=False, error="invalid status"))
                continue
        except (TypeError, ValueError) as exc:
            results.append(BulkRowResult(id="?", ok=False, error=str(exc)))
            continue

        created = None
        try:
            created = menu.create_product(
                ctx.restaurant_id,
                ProductCreate(
                    restaurant_id=ctx.restaurant_id,
                    name=name,
                    description=_optional_str(item.get("description")),
                    price_cents=price_cents,
                    currency=str(item.get("currency") or "MXN"),
                    image_path=_optional_str(item.get("image_path")),
                    status=status,
                    category_ids=category_ids,
                ),
            )
            invalidate(ctx)

            for group in option_groups:
                menu.add_option_group(ctx.restaurant_id, created.id, group)
                invalidate(ctx)

            changed_fields = ["name", "price_cents", "status"]
            if option_groups:
                changed_fields.append("option_groups")
            results.append(
                BulkRowResult(
                    id=str(created.id),
                    ok=True,
                    label=created.name,
                    changed_fields=changed_fields,
                )
            )
        except (ValidationError, NotFoundError, ConflictError, TypeError, ValueError) as exc:
            results.append(
                BulkRowResult(
                    id=str(created.id) if created is not None else "?",
                    ok=False,
                    error=str(exc),
                    label=name,
                )
            )

    return bulk_tool_result(entity_label="product", results=results, verb="Added")
