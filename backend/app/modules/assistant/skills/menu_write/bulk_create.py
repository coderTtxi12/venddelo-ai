"""Bulk create categories and products for menu_write."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.assistant.skills.base import ToolResult
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    BulkRowResult,
    _parse_items,
    _resolve_items_arg,
    bulk_tool_result,
)
from app.modules.menu.schemas import CategoryCreate
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
