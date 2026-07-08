"""Bulk option-item and option-group mutations for menu_write."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.menu_read.search import match_score, normalize_text, tokenize
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    BulkRowResult,
    _parse_items,
    _parse_uuid,
    _resolve_items_arg,
    _resolve_product_id,
    bulk_tool_result,
)
from app.modules.menu.schemas import OptionGroupCreate, OptionItemCreate, OptionItemUpdate
from app.modules.menu.service import MenuService

_OPTION_LABEL_STRONG_THRESHOLD = 0.92

_BULK_OPTION_ITEM_UPDATE_HINT = (
    "Ideal when updating more than one complement/add-on at once — use after menu_read "
    f"list_products (option_groups[].items[]) or bulk_get_products. Up to {BULK_DEFAULT_LIMIT} items per call. "
    "Each row needs product_id (or product name) and item_id; group_id is optional and "
    "resolved automatically from the product when omitted."
)

_BULK_OPTION_ITEM_VISIBILITY_HINT = (
    "For one complement name across the whole menu (e.g. Sprite out of stock), pass "
    "match_label + is_active — the server scans the preview menu and updates complements "
    "whose label matches (case/accent-insensitive). Returns ok with updated=0 when every "
    "match is already in the target state. When using items[] instead, each row MUST include "
    f"expected_label matching the live complement label or the row is rejected. "
    f"group_id is optional (resolved from product_id + item_id). "
    f"Up to {BULK_DEFAULT_LIMIT} per call."
)

_BULK_OPTION_ITEM_ADD_HINT = (
    "Add MANY complement choices to existing groups — use after menu_read confirms "
    f"group_id per product. Up to {BULK_DEFAULT_LIMIT} rows per call. Each row needs "
    "product_id (or product name), group_id, and label."
)

_BULK_OPTION_GROUP_ADD_HINT = (
    "Add MANY complement groups (extras, size, etc.) across products in one call. "
    f"Up to {BULK_DEFAULT_LIMIT} groups per call. Each row needs product_id (or name) "
    "and title; optional nested items[] for initial choices."
)


def bulk_option_item_tool_description(*, action: str) -> str:
    return f"{action} {_BULK_OPTION_ITEM_UPDATE_HINT}"


def bulk_option_item_visibility_tool_description(*, action: str) -> str:
    return f"{action} {_BULK_OPTION_ITEM_VISIBILITY_HINT}"


def bulk_option_item_add_tool_description(*, action: str) -> str:
    return f"{action} {_BULK_OPTION_ITEM_ADD_HINT}"


def bulk_option_group_add_tool_description(*, action: str) -> str:
    return f"{action} {_BULK_OPTION_GROUP_ADD_HINT}"


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def option_item_label_matches(needle: str, label: str) -> bool:
    """Return True when ``needle`` identifies the same complement as ``label``."""
    normalized_needle = normalize_text(needle)
    normalized_label = normalize_text(label)
    if not normalized_needle or not normalized_label:
        return False
    if normalized_needle == normalized_label:
        return True
    needle_tokens = tokenize(needle)
    label_tokens = tokenize(label)
    if len(needle_tokens) == 1 and needle_tokens[0] in label_tokens:
        return True
    return match_score(needle, label) >= _OPTION_LABEL_STRONG_THRESHOLD


@dataclass(frozen=True, slots=True)
class _OptionItemRef:
    product_id: uuid.UUID
    product_name: str
    group_id: uuid.UUID
    group_title: str
    item_id: uuid.UUID
    item_label: str
    is_active: bool


@dataclass(frozen=True, slots=True)
class _LabelScanResult:
    label_matches: tuple[_OptionItemRef, ...]
    to_update: tuple[_OptionItemRef, ...]


def _iter_option_item_refs(menu: MenuService, ctx: AgentContext) -> Iterator[_OptionItemRef]:
    """Scan all owner-visible products with complements (preview menu, eager-loaded)."""
    preview = menu.get_preview_menu(ctx.restaurant_id)
    for product in preview.products:
        for group in product.option_groups:
            for item in group.items:
                yield _OptionItemRef(
                    product_id=product.id,
                    product_name=product.name,
                    group_id=group.id,
                    group_title=group.title,
                    item_id=item.id,
                    item_label=item.label,
                    is_active=item.is_active,
                )


def _scan_option_items_by_label(
    menu: MenuService,
    ctx: AgentContext,
    *,
    match_label: str,
    target_active: bool,
) -> _LabelScanResult:
    label_matches: list[_OptionItemRef] = []
    to_update: list[_OptionItemRef] = []
    for ref in _iter_option_item_refs(menu, ctx):
        if not option_item_label_matches(match_label, ref.item_label):
            continue
        label_matches.append(ref)
        if ref.is_active != target_active:
            to_update.append(ref)
    capped = to_update[:BULK_DEFAULT_LIMIT]
    return _LabelScanResult(
        label_matches=tuple(label_matches),
        to_update=tuple(capped),
    )


def _collect_option_items_by_label(
    menu: MenuService,
    ctx: AgentContext,
    *,
    match_label: str,
    target_active: bool,
) -> list[_OptionItemRef]:
    return list(
        _scan_option_items_by_label(
            menu,
            ctx,
            match_label=match_label,
            target_active=target_active,
        ).to_update
    )


def _parse_visibility_value(item: dict[str, Any]) -> tuple[bool | None, str | None]:
    if "is_active" in item:
        return bool(item["is_active"]), None
    if "visible" in item:
        return bool(item["visible"]), None
    if "is_visible" in item:
        return bool(item["is_visible"]), None
    return None, "is_active is required"


def _parse_expected_label(item: dict[str, Any]) -> tuple[str | None, str | None]:
    for key in ("expected_label", "match_label", "complement_label", "item_label"):
        text = _optional_str(item.get(key))
        if text:
            return text, None
    return None, "expected_label is required (must match the live complement label)"


def _verify_expected_label(
    menu: MenuService,
    ctx: AgentContext,
    *,
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    item_id: uuid.UUID,
    expected_label: str,
) -> str | None:
    try:
        product = menu.get_product(ctx.restaurant_id, product_id)
    except NotFoundError:
        return "Product not found"
    group = next((entry for entry in product.option_groups if entry.id == group_id), None)
    if group is None:
        return "Option group not found"
    item = next((entry for entry in group.items if entry.id == item_id), None)
    if item is None:
        return "Option item not found"
    if not option_item_label_matches(expected_label, item.label):
        return (
            f"expected_label {expected_label!r} does not match live label {item.label!r}; "
            "skipped to avoid updating the wrong complement"
        )
    return None


def _row_id(entity_id: uuid.UUID) -> str:
    return str(entity_id)


def _resolve_group_id(item: dict[str, Any]) -> tuple[uuid.UUID | None, str | None]:
    group_id = _parse_uuid(item.get("group_id") or item.get("option_group_id"))
    if group_id is None:
        return None, "group_id is required"
    return group_id, None


def _parse_nested_option_items(raw: Any) -> tuple[list[OptionItemCreate], str | None]:
    if raw is None:
        return [], None
    if not isinstance(raw, list):
        return [], "items must be a list"
    parsed: list[OptionItemCreate] = []
    for entry in raw:
        if not isinstance(entry, dict):
            return [], "Each nested item must be an object"
        label = _optional_str(entry.get("label"))
        if not label:
            return [], "Each nested item requires a label"
        parsed.append(
            OptionItemCreate(
                label=label,
                price_delta_cents=int(entry.get("price_delta_cents", 0) or 0),
                sort_index=int(entry.get("sort_index", 0) or 0),
            )
        )
    return parsed, None


def _find_option_item_on_product(
    menu: MenuService,
    ctx: AgentContext,
    product_id: uuid.UUID,
    item_id: uuid.UUID,
) -> tuple[uuid.UUID | None, str | None]:
    try:
        product = menu.get_product(ctx.restaurant_id, product_id)
    except NotFoundError:
        return None, "Product not found"
    for group in product.option_groups:
        if any(entry.id == item_id for entry in group.items):
            return group.id, None
    return None, "Option item not found on this product"


def _resolve_option_item_target(
    menu: MenuService,
    ctx: AgentContext,
    product_id: uuid.UUID,
    item: dict[str, Any],
) -> tuple[uuid.UUID | None, uuid.UUID | None, str | None]:
    item_id = _parse_uuid(item.get("item_id") or item.get("option_item_id") or item.get("id"))
    if item_id is None:
        return None, None, "item_id is required"

    explicit_group_id = _parse_uuid(item.get("group_id") or item.get("option_group_id"))
    if explicit_group_id is not None:
        try:
            product = menu.get_product(ctx.restaurant_id, product_id)
        except NotFoundError:
            return None, item_id, "Product not found"
        group = next((entry for entry in product.option_groups if entry.id == explicit_group_id), None)
        if group is None:
            return None, item_id, "Option group not found on this product"
        if not any(entry.id == item_id for entry in group.items):
            return None, item_id, "Option item not found in this group"
        return explicit_group_id, item_id, None

    group_id, err = _find_option_item_on_product(menu, ctx, product_id, item_id)
    if err:
        return None, item_id, err
    assert group_id is not None
    return group_id, item_id, None


def _apply_option_item_update(
    menu: MenuService,
    ctx: AgentContext,
    *,
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    item_id: uuid.UUID,
    update: OptionItemUpdate,
    invalidate: Callable[[AgentContext], None],
    result_label: str | None = None,
) -> BulkRowResult:
    try:
        updated = menu.update_option_item(
            ctx.restaurant_id,
            product_id,
            group_id,
            item_id,
            update,
        )
        invalidate(ctx)
        changed = [key for key, value in update.model_dump(exclude_unset=True).items() if value is not None]
        return BulkRowResult(
            id=_row_id(item_id),
            ok=True,
            label=result_label or updated.label,
            changed_fields=changed or None,
        )
    except (ValidationError, NotFoundError, ConflictError) as exc:
        return BulkRowResult(id=_row_id(item_id), ok=False, error=str(exc))


def _bulk_update_option_item_field(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    field_name: str,
    parse_value: Callable[[dict[str, Any]], tuple[Any | None, str | None]],
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "option_items", "updates")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="option item")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        product_id, resolve_err = _resolve_product_id(menu, ctx, item)
        if resolve_err:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err))
            continue
        group_id, item_id, id_err = _resolve_option_item_target(menu, ctx, product_id, item)
        if id_err or group_id is None or item_id is None:
            results.append(
                BulkRowResult(
                    id=str(item_id) if item_id else "?",
                    ok=False,
                    error=id_err or "Missing group_id or item_id",
                )
            )
            continue
        value, value_err = parse_value(item)
        if value_err:
            results.append(BulkRowResult(id=_row_id(item_id), ok=False, error=value_err))
            continue
        results.append(
            _apply_option_item_update(
                menu,
                ctx,
                product_id=product_id,
                group_id=group_id,
                item_id=item_id,
                update=OptionItemUpdate(**{field_name: value}),
                invalidate=invalidate,
            )
        )

    return bulk_tool_result(entity_label="option item", results=results)


def bulk_update_option_item_visibility(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    match_label = _optional_str(args.get("match_label") or args.get("complement_label"))
    raw_items = _resolve_items_arg(args, "items", "option_items", "updates")

    if match_label and not raw_items:
        visibility, visibility_err = _parse_visibility_value(args)
        if visibility_err:
            return ToolResult(ok=False, summary=visibility_err)
        assert visibility is not None
        scan = _scan_option_items_by_label(
            menu,
            ctx,
            match_label=match_label,
            target_active=visibility,
        )
        state_label = "active" if visibility else "inactive"
        if not scan.label_matches:
            return ToolResult(
                ok=False,
                summary=f"No complements matching {match_label!r} were found in the menu",
                data={
                    "label_match_count": 0,
                    "target_is_active": visibility,
                },
            )
        if not scan.to_update:
            return ToolResult(
                ok=True,
                summary=(
                    f"All {len(scan.label_matches)} complement(s) matching {match_label!r} "
                    f"are already {state_label}"
                ),
                data={
                    "updated": 0,
                    "failed": 0,
                    "already_in_state": len(scan.label_matches),
                    "target_is_active": visibility,
                    "matches": [
                        {
                            "product_name": ref.product_name,
                            "group_title": ref.group_title,
                            "item_label": ref.item_label,
                            "is_active": ref.is_active,
                        }
                        for ref in scan.label_matches
                    ],
                    "results": [],
                },
            )
        results: list[BulkRowResult] = []
        for ref in scan.to_update:
            results.append(
                _apply_option_item_update(
                    menu,
                    ctx,
                    product_id=ref.product_id,
                    group_id=ref.group_id,
                    item_id=ref.item_id,
                    update=OptionItemUpdate(is_active=visibility),
                    invalidate=invalidate,
                    result_label=f"{ref.item_label} ({ref.product_name} / {ref.group_title})",
                )
            )
        return bulk_tool_result(entity_label="option item", results=results)

    items, err = _parse_items(raw_items, max_items=BULK_DEFAULT_LIMIT, entity_label="option item")
    if err:
        return ToolResult(ok=False, summary=err)

    results = []
    for item in items:
        product_id, resolve_err = _resolve_product_id(menu, ctx, item)
        if resolve_err:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err))
            continue
        group_id, item_id, id_err = _resolve_option_item_target(menu, ctx, product_id, item)
        if id_err or group_id is None or item_id is None:
            results.append(
                BulkRowResult(
                    id=str(item_id) if item_id else "?",
                    ok=False,
                    error=id_err or "Missing group_id or item_id",
                )
            )
            continue
        expected_label, label_err = _parse_expected_label(item)
        if label_err:
            results.append(BulkRowResult(id=_row_id(item_id), ok=False, error=label_err))
            continue
        assert expected_label is not None
        mismatch = _verify_expected_label(
            menu,
            ctx,
            product_id=product_id,
            group_id=group_id,
            item_id=item_id,
            expected_label=expected_label,
        )
        if mismatch:
            results.append(BulkRowResult(id=_row_id(item_id), ok=False, error=mismatch))
            continue
        visibility, visibility_err = _parse_visibility_value(item)
        if visibility_err:
            results.append(BulkRowResult(id=_row_id(item_id), ok=False, error=visibility_err))
            continue
        assert visibility is not None
        results.append(
            _apply_option_item_update(
                menu,
                ctx,
                product_id=product_id,
                group_id=group_id,
                item_id=item_id,
                update=OptionItemUpdate(is_active=visibility),
                invalidate=invalidate,
                result_label=expected_label,
            )
        )

    return bulk_tool_result(entity_label="option item", results=results)


def bulk_update_option_item_labels(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_label(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        for key in ("new_label", "label"):
            if key in item and item[key] is not None:
                text = str(item[key]).strip()
                if text:
                    return text, None
        return None, "new_label is required"

    return _bulk_update_option_item_field(
        menu,
        ctx,
        args,
        field_name="label",
        parse_value=parse_label,
        invalidate=invalidate,
    )


def bulk_update_option_item_prices(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_price(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        raw = item.get("price_delta_cents")
        if raw is None and "price" in item:
            raw = item.get("price")
        if raw is None:
            return None, "price_delta_cents is required"
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None, "price_delta_cents must be an integer (cents)"
        if value < 0:
            return None, "price_delta_cents must be >= 0"
        return value, None

    return _bulk_update_option_item_field(
        menu,
        ctx,
        args,
        field_name="price_delta_cents",
        parse_value=parse_price,
        invalidate=invalidate,
    )


def bulk_add_option_items(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "option_items")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="option item")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        product_id, resolve_err = _resolve_product_id(menu, ctx, item)
        if resolve_err:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err))
            continue
        group_id, group_err = _resolve_group_id(item)
        if group_err or group_id is None:
            results.append(BulkRowResult(id="?", ok=False, error=group_err or "group_id is required"))
            continue
        label = _optional_str(item.get("label"))
        if not label:
            results.append(BulkRowResult(id="?", ok=False, error="label is required"))
            continue
        try:
            price_delta_cents = int(item.get("price_delta_cents", 0) or 0)
            sort_index = int(item.get("sort_index", 0) or 0)
        except (TypeError, ValueError):
            results.append(BulkRowResult(id="?", ok=False, error="price_delta_cents must be an integer"))
            continue
        if price_delta_cents < 0:
            results.append(BulkRowResult(id="?", ok=False, error="price_delta_cents must be >= 0"))
            continue
        try:
            created = menu.add_option_item(
                ctx.restaurant_id,
                product_id,
                group_id,
                OptionItemCreate(
                    label=label,
                    price_delta_cents=price_delta_cents,
                    sort_index=sort_index,
                ),
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=_row_id(created.id),
                    ok=True,
                    label=created.label,
                    changed_fields=["label", "price_delta_cents"],
                )
            )
        except (ValidationError, NotFoundError, ConflictError) as exc:
            results.append(BulkRowResult(id="?", ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="option item", results=results, verb="Added")


def bulk_add_option_groups(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "groups", "option_groups")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT, entity_label="option group")
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        product_id, resolve_err = _resolve_product_id(menu, ctx, item)
        if resolve_err:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err))
            continue
        title = _optional_str(item.get("title"))
        if not title:
            results.append(BulkRowResult(id="?", ok=False, error="title is required"))
            continue
        nested_items, nested_err = _parse_nested_option_items(item.get("items"))
        if nested_err:
            results.append(BulkRowResult(id="?", ok=False, error=nested_err))
            continue
        selection = str(item.get("selection") or "single")
        if selection not in {"single", "multi"}:
            results.append(BulkRowResult(id="?", ok=False, error="selection must be single or multi"))
            continue
        try:
            max_selections = (
                int(item["max_selections"]) if item.get("max_selections") is not None else None
            )
            group = OptionGroupCreate(
                title=title,
                required=bool(item.get("required", False)),
                selection=selection,
                min_selections=int(item.get("min_selections", 0) or 0),
                max_selections=max_selections,
                sort_index=int(item.get("sort_index", 0) or 0),
                items=nested_items,
            )
            created = menu.add_option_group(ctx.restaurant_id, product_id, group)
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=_row_id(created.id),
                    ok=True,
                    label=created.title,
                    changed_fields=["title"],
                )
            )
        except (ValidationError, NotFoundError, ConflictError) as exc:
            results.append(BulkRowResult(id="?", ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="option group", results=results, verb="Added")


def bulk_option_item_delete_tool_description(*, action: str) -> str:
    return (
        f"{action} Hard-delete complement choices from ONE product. "
        f"Use after menu_read get_product. All rows share the same "
        f"product_id (or name) and need item_id and expected_label; group_id is "
        f"optional and resolved from the product when omitted. "
        f"Up to {BULK_DEFAULT_LIMIT} per call. Prefer bulk_update_option_item_visibility "
        f"when the complement is only temporarily unavailable."
    )


def _delete_option_item_row(
    menu: MenuService,
    ctx: AgentContext,
    *,
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    item_id: uuid.UUID,
    expected_label: str,
    invalidate: Callable[[AgentContext], None],
) -> BulkRowResult:
    mismatch = _verify_expected_label(
        menu,
        ctx,
        product_id=product_id,
        group_id=group_id,
        item_id=item_id,
        expected_label=expected_label,
    )
    if mismatch:
        return BulkRowResult(id=_row_id(item_id), ok=False, error=mismatch)
    try:
        menu.delete_option_item(ctx.restaurant_id, product_id, group_id, item_id)
        invalidate(ctx)
        return BulkRowResult(
            id=_row_id(item_id),
            ok=True,
            label=expected_label,
            changed_fields=["deleted"],
        )
    except (ValidationError, NotFoundError, ConflictError) as exc:
        return BulkRowResult(id=_row_id(item_id), ok=False, error=str(exc))


def delete_option_item(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    product_id = _parse_uuid(args.get("product_id"))
    if product_id is None:
        return ToolResult(ok=False, summary="product_id is required")

    group_id, item_id, id_err = _resolve_option_item_target(menu, ctx, product_id, args)
    if id_err or group_id is None or item_id is None:
        return ToolResult(ok=False, summary=id_err or "Missing item_id")

    expected_label, label_err = _parse_expected_label(args)
    if label_err:
        return ToolResult(ok=False, summary=label_err)
    assert expected_label is not None

    result = _delete_option_item_row(
        menu,
        ctx,
        product_id=product_id,
        group_id=group_id,
        item_id=item_id,
        expected_label=expected_label,
        invalidate=invalidate,
    )
    if result.ok:
        return ToolResult(
            ok=True,
            summary=f"Deleted complement {expected_label!r}",
            data={"item_id": result.id, "label": result.label},
        )
    return ToolResult(ok=False, summary=result.error or "Failed to delete complement")


def bulk_delete_option_items(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    product_id, resolve_err = _resolve_product_id(menu, ctx, args)
    if resolve_err:
        return ToolResult(ok=False, summary=resolve_err)

    raw_items = _resolve_items_arg(args, "items", "option_items")
    items, err = _parse_items(raw_items, max_items=BULK_DEFAULT_LIMIT, entity_label="option item")
    if err:
        return ToolResult(ok=False, summary=err)

    assert product_id is not None
    results: list[BulkRowResult] = []
    for item in items:
        group_id, item_id, id_err = _resolve_option_item_target(menu, ctx, product_id, item)
        if id_err or group_id is None or item_id is None:
            results.append(
                BulkRowResult(
                    id=str(item_id) if item_id else "?",
                    ok=False,
                    error=id_err or "Missing group_id or item_id",
                )
            )
            continue
        expected_label, label_err = _parse_expected_label(item)
        if label_err:
            results.append(BulkRowResult(id=_row_id(item_id), ok=False, error=label_err))
            continue
        assert expected_label is not None
        results.append(
            _delete_option_item_row(
                menu,
                ctx,
                product_id=product_id,
                group_id=group_id,
                item_id=item_id,
                expected_label=expected_label,
                invalidate=invalidate,
            )
        )

    return bulk_tool_result(entity_label="option item", results=results, verb="Deleted")
