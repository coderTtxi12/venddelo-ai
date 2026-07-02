"""Bulk category mutations for menu_write."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import PaginationParams
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.menu_read.tools import (
    DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
)
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    BulkRowResult,
    _parse_items,
    _resolve_items_arg,
    bulk_tool_result,
)
from app.modules.menu.schemas import CategoryUpdate
from app.modules.menu.service import MenuService
from app.modules.restaurants.schemas import RestaurantUpdate
from app.modules.restaurants.service import RestaurantService

_SPECIAL_CATEGORY_IDS = frozenset(
    {
        DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
        DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    }
)
ALLOWED_DISPLAY_LAYOUTS = frozenset({"vertical", "horizontal", "grid"})

_BULK_CATEGORY_HINT = (
    "Ideal when updating more than one category at once — use after menu_read "
    f"list_categories. Up to {BULK_DEFAULT_LIMIT} items per call."
)


def bulk_category_tool_description(*, action: str) -> str:
    return f"{action} {_BULK_CATEGORY_HINT}"


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_uuid_optional(value: Any) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _is_special_category_id(value: str) -> bool:
    return value in _SPECIAL_CATEGORY_IDS


def _parse_display_layout(value: Any) -> str:
    layout = _optional_str(value)
    if layout is None:
        raise ValidationError("display_layout cannot be empty")
    if layout not in ALLOWED_DISPLAY_LAYOUTS:
        allowed = ", ".join(sorted(ALLOWED_DISPLAY_LAYOUTS))
        raise ValidationError(f"display_layout must be one of: {allowed}")
    return layout


def _resolve_category_target(
    menu: MenuService,
    ctx: AgentContext,
    item: dict[str, Any],
    *,
    name_keys: tuple[str, ...] = ("category_name", "current_name", "name"),
) -> tuple[str | uuid.UUID | None, bool, str | None]:
    """Return (category_id_or_special_key, is_special, error)."""
    raw_id = item.get("category_id") or item.get("id")
    if raw_id is not None and str(raw_id).strip():
        category_id_str = str(raw_id).strip()
        if _is_special_category_id(category_id_str):
            return category_id_str, True, None
        category_uuid = _parse_uuid_optional(category_id_str)
        if category_uuid is not None:
            return category_uuid, False, None
        return None, False, f"Invalid category_id {category_id_str!r}"

    lookup_name: str | None = None
    for key in name_keys:
        raw = item.get(key)
        if raw is not None and str(raw).strip():
            lookup_name = str(raw).strip()
            break
    if not lookup_name:
        return None, False, "Provide category_id or category_name"

    page = menu.list_all_categories(
        ctx.restaurant_id,
        PaginationParams(limit=200, cursor=None),
    )
    needle = lookup_name.casefold()
    matches = [category for category in page.items if category.name.casefold() == needle]
    if len(matches) == 1:
        return matches[0].id, False, None
    if len(matches) > 1:
        labels = ", ".join(category.name for category in matches[:5])
        return None, False, f"Ambiguous category name {lookup_name!r}; candidates: {labels}"
    return None, False, f"Category not found for name {lookup_name!r}"


def _row_id(category_key: str | uuid.UUID) -> str:
    return str(category_key)


def _update_special_category_fields(
    ctx: AgentContext,
    category_id: str,
    *,
    name: str | None = None,
    is_active: bool | None = None,
    forbidden: tuple[str, ...] = (),
) -> BulkRowResult:
    if forbidden:
        labels = ", ".join(forbidden)
        return BulkRowResult(
            id=category_id,
            ok=False,
            error=f"{labels} do not apply to special categories",
        )
    if name is None and is_active is None:
        return BulkRowResult(id=category_id, ok=False, error="No supported fields to update")

    update_fields: dict[str, Any] = {}
    if category_id == DIGITAL_MENU_PROMOTIONS_CATEGORY_ID:
        if name is not None:
            update_fields["digital_menu_promotions_category_name"] = name
        if is_active is not None:
            update_fields["digital_menu_promotions_category_enabled"] = is_active
    else:
        if name is not None:
            update_fields["digital_menu_limited_time_category_name"] = name
        if is_active is not None:
            update_fields["digital_menu_limited_time_category_enabled"] = is_active

    try:
        RestaurantService(ctx.uow.restaurants).update(
            ctx.restaurant_id,
            RestaurantUpdate(**update_fields),
        )
    except (NotFoundError, ValidationError, ConflictError) as exc:
        return BulkRowResult(id=category_id, ok=False, error=str(exc))

    changed: list[str] = []
    if name is not None:
        changed.append("name")
    if is_active is not None:
        changed.append("is_active")
    label = name if name is not None else category_id
    return BulkRowResult(
        id=category_id,
        ok=True,
        label=label,
        changed_fields=changed,
    )


def _bulk_update_category_field(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    field_name: str,
    parse_value: Callable[[dict[str, Any]], tuple[Any | None, str | None]],
    special_allowed: bool = False,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "categories", "updates")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="category")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        target, is_special, resolve_err = _resolve_category_target(menu, ctx, item)
        if resolve_err or target is None:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err or "Missing category"))
            continue

        value, value_err = parse_value(item)
        if value_err:
            results.append(BulkRowResult(id=_row_id(target), ok=False, error=value_err))
            continue

        if is_special:
            if not special_allowed:
                results.append(
                    BulkRowResult(
                        id=_row_id(target),
                        ok=False,
                        error=f"{field_name} does not apply to special categories",
                    )
                )
                continue
            if field_name == "name":
                row = _update_special_category_fields(
                    ctx, str(target), name=str(value)
                )
            elif field_name == "is_active":
                row = _update_special_category_fields(
                    ctx, str(target), is_active=bool(value)
                )
            else:
                row = BulkRowResult(
                    id=_row_id(target),
                    ok=False,
                    error=f"{field_name} does not apply to special categories",
                )
            results.append(row)
            if row.ok:
                invalidate(ctx)
            continue

        assert isinstance(target, uuid.UUID)
        try:
            category = menu.update_category(
                ctx.restaurant_id,
                target,
                CategoryUpdate(**{field_name: value}),
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=str(target),
                    ok=True,
                    label=category.name,
                    changed_fields=[field_name],
                )
            )
        except (ValidationError, NotFoundError, ConflictError) as exc:
            results.append(BulkRowResult(id=str(target), ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="category", results=results)


def bulk_update_category_names(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_name(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        for key in ("new_name", "name"):
            if key in item and item[key] is not None:
                text = str(item[key]).strip()
                if text:
                    return text, None
        return None, "new_name is required"

    raw = _resolve_items_arg(args, "items", "categories", "updates")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="category")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        lookup_item = dict(item)
        if "new_name" in lookup_item and "name" in lookup_item:
            lookup_item = {k: v for k, v in lookup_item.items() if k != "new_name"}
        target, is_special, resolve_err = _resolve_category_target(
            menu,
            ctx,
            lookup_item,
            name_keys=("category_name", "current_name", "name"),
        )
        if resolve_err or target is None:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err or "Missing category"))
            continue
        value, value_err = parse_name(item)
        if value_err:
            results.append(BulkRowResult(id=_row_id(target), ok=False, error=value_err))
            continue

        if is_special:
            row = _update_special_category_fields(ctx, str(target), name=str(value))
            results.append(row)
            if row.ok:
                invalidate(ctx)
            continue

        assert isinstance(target, uuid.UUID)
        try:
            category = menu.update_category(
                ctx.restaurant_id,
                target,
                CategoryUpdate(name=str(value)),
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=str(target),
                    ok=True,
                    label=category.name,
                    changed_fields=["name"],
                )
            )
        except (ValidationError, NotFoundError, ConflictError) as exc:
            results.append(BulkRowResult(id=str(target), ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="category", results=results)


def bulk_update_category_descriptions(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_description(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        for key in ("description", "text", "new_description", "desc"):
            if key in item and item[key] is not None:
                return str(item[key]).strip(), None
        return None, "description is required"

    return _bulk_update_category_field(
        menu,
        ctx,
        args,
        field_name="description",
        parse_value=parse_description,
        special_allowed=False,
        invalidate=invalidate,
    )


def bulk_update_category_sort_indices(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_sort_index(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        raw = item.get("sort_index")
        if raw is None and "sort" in item:
            raw = item.get("sort")
        if raw is None:
            return None, "sort_index is required"
        try:
            return int(raw), None
        except (TypeError, ValueError):
            return None, "sort_index must be an integer"

    return _bulk_update_category_field(
        menu,
        ctx,
        args,
        field_name="sort_index",
        parse_value=parse_sort_index,
        special_allowed=False,
        invalidate=invalidate,
    )


def bulk_update_category_visibility(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_visibility(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        if "is_active" in item:
            return bool(item["is_active"]), None
        if "visible" in item:
            return bool(item["visible"]), None
        if "is_visible" in item:
            return bool(item["is_visible"]), None
        return None, "is_active (visibility) is required"

    return _bulk_update_category_field(
        menu,
        ctx,
        args,
        field_name="is_active",
        parse_value=parse_visibility,
        special_allowed=True,
        invalidate=invalidate,
    )


def bulk_update_category_display_layout(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_layout(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        raw = item.get("display_layout")
        if raw is None and "layout" in item:
            raw = item.get("layout")
        if raw is None:
            return None, "display_layout is required"
        try:
            return _parse_display_layout(raw), None
        except ValidationError as exc:
            return None, str(exc)

    return _bulk_update_category_field(
        menu,
        ctx,
        args,
        field_name="display_layout",
        parse_value=parse_layout,
        special_allowed=False,
        invalidate=invalidate,
    )
