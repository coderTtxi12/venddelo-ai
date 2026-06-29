from __future__ import annotations

import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.pagination import PaginationParams
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.menu.schemas import ProductDTO
from app.modules.menu.service import MenuService

DEFAULT_LIST_PRODUCTS_LIMIT = 20
MAX_LIST_PRODUCTS_LIMIT = 50


def _list_products_limit(args: dict[str, Any]) -> int:
    raw = args.get("limit", DEFAULT_LIST_PRODUCTS_LIMIT)
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        limit = DEFAULT_LIST_PRODUCTS_LIMIT
    return max(1, min(limit, MAX_LIST_PRODUCTS_LIMIT))


_SKILL_MD = Path(__file__).resolve().parent / "SKILL.md"


@lru_cache
def menu_read_skill_prompt_section() -> str:
    return _SKILL_MD.read_text(encoding="utf-8")


def _product_payload(product: ProductDTO) -> dict[str, Any]:
    return {
        "id": str(product.id),
        "name": product.name,
        "description": product.description,
        "price_cents": product.price_cents,
        "currency": product.currency,
        "is_active": product.is_active,
        "is_published": product.is_published,
        "approval_status": product.approval_status,
        "category_ids": [str(item) for item in product.category_ids],
        "option_groups": [
            {
                "id": str(group.id),
                "title": group.title,
                "required": group.required,
                "selection": group.selection,
                "items": [
                    {
                        "id": str(item.id),
                        "label": item.label,
                        "price_delta_cents": item.price_delta_cents,
                        "is_active": item.is_active,
                    }
                    for item in group.items
                ],
            }
            for group in product.option_groups
        ],
    }


class MenuReadSkill:
    id = "menu_read"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="list_categories",
                description="List active menu categories for the current restaurant.",
                effect="read",
                input_schema={"type": "object", "properties": {}},
            ),
            ToolDefinition(
                name="list_products",
                description=(
                    "List active products with cursor pagination. "
                    "Omit category_id for all categories; set category_id to filter one category."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "category_id": {
                            "type": "string",
                            "description": "Optional category UUID. Omit to list all categories.",
                        },
                        "cursor": {
                            "type": "string",
                            "description": "Cursor from a previous list_products call.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": (
                                f"Page size (default {DEFAULT_LIST_PRODUCTS_LIMIT}, "
                                f"max {MAX_LIST_PRODUCTS_LIMIT})."
                            ),
                        },
                    },
                },
            ),
            ToolDefinition(
                name="search_products",
                description="Search products by name or description in the current restaurant.",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
            ToolDefinition(
                name="get_product",
                description="Get one product by id in the current restaurant.",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"product_id": {"type": "string"}},
                    "required": ["product_id"],
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        service = MenuService(ctx.uow.menu)
        if tool_name == "list_categories":
            page = service.list_categories(ctx.restaurant_id, PaginationParams(limit=100))
            categories = [
                {
                    "id": str(category.id),
                    "name": category.name,
                    "description": category.description,
                    "sort_index": category.sort_index,
                    "is_active": category.is_active,
                }
                for category in page.items
                if category.is_active
            ]
            return ToolResult(
                ok=True,
                summary=f"Found {len(categories)} active categories",
                data={"categories": categories},
            )

        if tool_name == "list_products":
            limit = _list_products_limit(args)
            cursor_raw = args.get("cursor")
            cursor = str(cursor_raw).strip() if cursor_raw is not None else None
            if cursor == "":
                cursor = None

            category_id: uuid.UUID | None = None
            category_id_raw = args.get("category_id")
            if category_id_raw:
                try:
                    category_id = uuid.UUID(str(category_id_raw))
                except ValueError:
                    return ToolResult(ok=False, summary="Invalid category_id")

            try:
                page = service.list_products_page(
                    ctx.restaurant_id,
                    PaginationParams(limit=limit, cursor=cursor),
                    category_id=category_id,
                )
            except NotFoundError:
                return ToolResult(ok=False, summary="Category not found")

            products = [_product_payload(product) for product in page.items if product.is_active]
            data: dict[str, Any] = {
                "products": products,
                "next_cursor": page.next_cursor,
                "has_more": page.has_more,
                "limit": limit,
            }
            if category_id is not None:
                data["category_id"] = str(category_id)
            scope = f"category {category_id}" if category_id else "all categories"
            return ToolResult(
                ok=True,
                summary=(
                    f"Listed {len(products)} active products ({scope}, "
                    f"has_more={page.has_more})"
                ),
                data=data,
            )

        if tool_name == "search_products":
            query = str(args.get("query", "")).strip().casefold()
            page = service.list_products(ctx.restaurant_id, PaginationParams(limit=100))
            products = []
            for product in page.items:
                haystack = f"{product.name} {product.description or ''}".casefold()
                if product.is_active and (not query or query in haystack):
                    products.append(_product_payload(product))
            return ToolResult(
                ok=True,
                summary=f"Found {len(products)} matching products",
                data={"products": products[:20]},
            )

        if tool_name == "get_product":
            try:
                product_id = uuid.UUID(str(args.get("product_id")))
                product = service.get_product(ctx.restaurant_id, product_id)
            except (ValueError, NotFoundError):
                return ToolResult(ok=False, summary="Product not found")
            return ToolResult(
                ok=True,
                summary=f"Found product {product.name}",
                data={"product": _product_payload(product)},
            )

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")

    def system_prompt_section(self) -> str:
        return menu_read_skill_prompt_section()
