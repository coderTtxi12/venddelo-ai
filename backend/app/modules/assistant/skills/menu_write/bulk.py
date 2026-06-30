"""Bulk product mutations for menu_write (names, descriptions, prices)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.product_resolve import resolve_product
from app.modules.menu.schemas import ProductUpdate
from app.modules.menu.service import MenuService

BULK_DEFAULT_LIMIT = 50


@dataclass(frozen=True, slots=True)
class BulkRowResult:
    id: str
    ok: bool
    label: str | None = None
    error: str | None = None
    changed_fields: list[str] | None = None


def _coerce_items_array(raw: Any) -> list[dict[str, Any]] | None:
    if isinstance(raw, str):
        stripped = raw.strip()
        if not stripped:
            return None
        try:
            raw = json.loads(stripped)
        except json.JSONDecodeError:
            return None
    if isinstance(raw, list):
        return [entry for entry in raw if isinstance(entry, dict)]
    if isinstance(raw, dict):
        items: list[dict[str, Any]] = []
        for key, value in raw.items():
            if isinstance(value, dict):
                item = dict(value)
                if "product_id" not in item and "name" not in item:
                    item.setdefault("product_id", key)
                items.append(item)
            elif isinstance(value, str | int | float):
                items.append({"product_id": key, "value": value})
        return items
    return None


def _parse_items(raw: Any, *, max_items: int) -> tuple[list[dict[str, Any]], str | None]:
    coerced = _coerce_items_array(raw)
    if coerced is None:
        return [], "Provide items: a non-empty array of product patches"
    if not coerced:
        return [], "Provide items: a non-empty array of product patches"
    if len(coerced) > max_items:
        return [], f"At most {max_items} items per call (got {len(coerced)})"
    return coerced, None


def _resolve_items_arg(args: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in args and args[key] is not None:
            return args[key]
    return None


def _parse_uuid(value: Any) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _resolve_product_id(
    menu: MenuService,
    ctx: AgentContext,
    item: dict[str, Any],
    *,
    name_keys: tuple[str, ...] = ("product_name", "current_name", "name"),
) -> tuple[uuid.UUID | None, str | None]:
    product_id = _parse_uuid(item.get("product_id") or item.get("id"))
    if product_id is not None:
        return product_id, None

    lookup_name: str | None = None
    for key in name_keys:
        raw = item.get(key)
        if raw is not None and str(raw).strip():
            lookup_name = str(raw).strip()
            break
    if not lookup_name:
        return None, "Provide product_id or product_name"

    resolved = resolve_product(menu, ctx.restaurant_id, lookup_name)
    if resolved.status == "found" and resolved.product is not None:
        return resolved.product.id, None
    if resolved.status == "ambiguous":
        labels = ", ".join(product.name for _, product in resolved.matches[:5])
        return None, f"Ambiguous name {lookup_name!r}; candidates: {labels}"
    return None, f"Product not found for name {lookup_name!r}"


def bulk_tool_result(*, entity_label: str, results: list[BulkRowResult]) -> ToolResult:
    updated = sum(1 for row in results if row.ok)
    failed = len(results) - updated
    data: dict[str, Any] = {
        "updated": updated,
        "failed": failed,
        "results": [
            {
                "id": row.id,
                "ok": row.ok,
                **({"label": row.label} if row.label else {}),
                **({"error": row.error} if row.error else {}),
                **({"changed_fields": row.changed_fields} if row.changed_fields else {}),
            }
            for row in results
        ],
    }
    ok = updated > 0
    if failed == 0:
        summary = f"Updated {updated} {entity_label}(s)"
    elif updated == 0:
        summary = f"Failed to update any {entity_label} ({failed} error(s))"
    else:
        summary = f"Updated {updated} {entity_label}(s); {failed} failed"
    return ToolResult(ok=ok, summary=summary, data=data)


def _bulk_update_field(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    field_name: str,
    aliases: tuple[str, ...],
    parse_value: Callable[[dict[str, Any]], tuple[Any | None, str | None]],
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    raw = _resolve_items_arg(args, "items", "products", "updates")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT)
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        product_id, resolve_err = _resolve_product_id(menu, ctx, item)
        if resolve_err:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err))
            continue
        value, value_err = parse_value(item)
        if value_err:
            results.append(BulkRowResult(id=str(product_id), ok=False, error=value_err))
            continue
        try:
            product = menu.update_product(
                ctx.restaurant_id,
                product_id,
                ProductUpdate(**{field_name: value}),
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=str(product_id),
                    ok=True,
                    label=product.name,
                    changed_fields=[field_name],
                )
            )
        except (ValidationError, NotFoundError, ConflictError) as exc:
            results.append(BulkRowResult(id=str(product_id), ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="product", results=results)


def bulk_update_product_names(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_name(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        for key in ("new_name", "title"):
            if key in item and item[key] is not None:
                text = str(item[key]).strip()
                if text:
                    return text, None
        return None, "new_name is required"

    raw = _resolve_items_arg(args, "items", "products", "updates")
    items, err = _parse_items(raw, max_items=BULK_DEFAULT_LIMIT)
    if err:
        return ToolResult(ok=False, summary=err)

    results: list[BulkRowResult] = []
    for item in items:
        lookup_item = dict(item)
        if "new_name" in lookup_item and "name" in lookup_item:
            lookup_item = {k: v for k, v in lookup_item.items() if k != "new_name"}
        product_id, resolve_err = _resolve_product_id(
            menu,
            ctx,
            lookup_item,
            name_keys=("product_name", "current_name", "name"),
        )
        if resolve_err:
            results.append(BulkRowResult(id="?", ok=False, error=resolve_err))
            continue
        value, value_err = parse_name(item)
        if value_err:
            results.append(BulkRowResult(id=str(product_id), ok=False, error=value_err))
            continue
        try:
            product = menu.update_product(
                ctx.restaurant_id,
                product_id,
                ProductUpdate(name=value),
            )
            invalidate(ctx)
            results.append(
                BulkRowResult(
                    id=str(product_id),
                    ok=True,
                    label=product.name,
                    changed_fields=["name"],
                )
            )
        except (ValidationError, NotFoundError, ConflictError) as exc:
            results.append(BulkRowResult(id=str(product_id), ok=False, error=str(exc)))

    return bulk_tool_result(entity_label="product", results=results)


def bulk_update_product_descriptions(
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

    return _bulk_update_field(
        menu,
        ctx,
        args,
        field_name="description",
        aliases=("description", "text"),
        parse_value=parse_description,
        invalidate=invalidate,
    )


def bulk_update_product_prices(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
    *,
    invalidate: Callable[[AgentContext], None],
) -> ToolResult:
    def parse_price(item: dict[str, Any]) -> tuple[Any | None, str | None]:
        raw = item.get("price_cents")
        if raw is None and "price" in item:
            raw = item.get("price")
        if raw is None:
            return None, "price_cents is required"
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None, "price_cents must be an integer (cents)"
        if value < 0:
            return None, "price_cents must be >= 0"
        return value, None

    return _bulk_update_field(
        menu,
        ctx,
        args,
        field_name="price_cents",
        aliases=("price_cents", "price"),
        parse_value=parse_price,
        invalidate=invalidate,
    )
