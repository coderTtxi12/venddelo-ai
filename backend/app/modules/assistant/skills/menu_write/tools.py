"""menu_write skill — tenant-scoped menu mutations (no hard deletes)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.pagination import PaginationParams
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_write.bulk import (
    BULK_DEFAULT_LIMIT,
    bulk_update_product_descriptions,
    bulk_update_product_names,
    bulk_update_product_prices,
)
from app.modules.assistant.skills.menu_write.category_bulk import (
    bulk_category_tool_description,
    bulk_update_category_descriptions,
    bulk_update_category_display_layout,
    bulk_update_category_names,
    bulk_update_category_sort_indices,
    bulk_update_category_visibility,
)
from app.modules.assistant.skills.menu_read.tools import (
    DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME,
    DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME,
    DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
)
from app.modules.assistant.skills.product_resolve import resolve_product
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryDTO,
    CategoryProductOrderUpdate,
    CategoryUpdate,
    OptionGroupCreate,
    OptionGroupDTO,
    OptionGroupUpdate,
    OptionItemCreate,
    OptionItemDTO,
    OptionItemUpdate,
    ProductCreate,
    ProductDTO,
    ProductUpdate,
)
from app.modules.menu.service import MenuService
from app.modules.restaurants.schemas import RestaurantDTO, RestaurantUpdate
from app.modules.restaurants.service import RestaurantService


def _resolve_product_id_for_write(
    service: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
) -> tuple[uuid.UUID | None, ToolResult | None]:
    product_id_raw = args.get("product_id")
    if product_id_raw:
        try:
            return _parse_uuid(product_id_raw, "product_id"), None
        except ValidationError as exc:
            return None, ToolResult(ok=False, summary=str(exc))

    name_raw = args.get("name") or args.get("product_name")
    if not name_raw:
        return None, ToolResult(ok=False, summary="Provide product_id or name")

    resolved = resolve_product(service, ctx.restaurant_id, str(name_raw))
    if resolved.status == "found" and resolved.product is not None:
        return resolved.product.id, None
    if resolved.status == "ambiguous":
        labels = ", ".join(product.name for _, product in resolved.matches[:5])
        candidates = [
            {"id": str(product.id), "name": product.name, "match_score": round(score, 3)}
            for score, product in resolved.matches[:5]
        ]
        return None, ToolResult(
            ok=False,
            summary=f"Ambiguous product name {name_raw!r}; choose one: {labels}",
            data={"candidates": candidates, "ambiguous": True},
        )
    return None, ToolResult(
        ok=False,
        summary=f"No product matched name {name_raw!r}",
        data={"query": str(name_raw)},
    )


_SPECIAL_CATEGORY_IDS = frozenset(
    {
        DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
        DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    }
)
ALLOWED_DISPLAY_LAYOUTS = frozenset({"vertical", "horizontal", "grid"})


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


def _special_category_payload(restaurant: RestaurantDTO, category_id: str) -> dict[str, Any]:
    if category_id == DIGITAL_MENU_PROMOTIONS_CATEGORY_ID:
        return {
            "id": category_id,
            "name": (
                (restaurant.digital_menu_promotions_category_name or "").strip()
                or DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME
            ),
            "category_type": "special_promotions",
            "is_active": restaurant.digital_menu_promotions_category_enabled,
            "stored_in": "restaurants",
        }
    return {
        "id": category_id,
        "name": (
            (restaurant.digital_menu_limited_time_category_name or "").strip()
            or DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME
        ),
        "category_type": "special_limited_time",
        "is_active": restaurant.digital_menu_limited_time_category_enabled,
        "stored_in": "restaurants",
    }


def _update_special_category(
    ctx: AgentContext,
    category_id: str,
    args: dict[str, Any],
) -> ToolResult:
    if "description" in args or "sort_index" in args or "display_layout" in args:
        return ToolResult(
            ok=False,
            summary="description, sort_index, and display_layout do not apply to special categories",
        )

    update_fields: dict[str, Any] = {}
    if category_id == DIGITAL_MENU_PROMOTIONS_CATEGORY_ID:
        if "name" in args:
            name = _optional_str(args.get("name"))
            if not name:
                return ToolResult(ok=False, summary="name cannot be empty")
            update_fields["digital_menu_promotions_category_name"] = name
        if "is_active" in args:
            update_fields["digital_menu_promotions_category_enabled"] = bool(args["is_active"])
    else:
        if "name" in args:
            name = _optional_str(args.get("name"))
            if not name:
                return ToolResult(ok=False, summary="name cannot be empty")
            update_fields["digital_menu_limited_time_category_name"] = name
        if "is_active" in args:
            update_fields["digital_menu_limited_time_category_enabled"] = bool(args["is_active"])

    if not update_fields:
        return ToolResult(ok=False, summary="Provide at least one field to update")

    def action() -> RestaurantDTO:
        return RestaurantService(ctx.uow.restaurants).update(
            ctx.restaurant_id,
            RestaurantUpdate(**update_fields),
        )

    try:
        restaurant = action()
    except NotFoundError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Not found")
    except ValidationError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Validation error")
    except ConflictError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Conflict")

    _invalidate_menu_cache(ctx)
    return ToolResult(
        ok=True,
        summary="Updated special category",
        data={"category": _special_category_payload(restaurant, category_id)},
    )


def _category_payload(category: CategoryDTO) -> dict[str, Any]:
    return {
        "id": str(category.id),
        "name": category.name,
        "description": category.description,
        "sort_index": category.sort_index,
        "display_layout": category.display_layout,
        "is_active": category.is_active,
    }


def _product_payload(product: ProductDTO) -> dict[str, Any]:
    return {
        "id": str(product.id),
        "name": product.name,
        "description": product.description,
        "price_cents": product.price_cents,
        "currency": product.currency,
        "is_published": product.is_published,
        "is_active": product.is_active,
        "approval_status": product.approval_status,
        "category_ids": [str(category_id) for category_id in product.category_ids],
    }


def _option_group_payload(group: OptionGroupDTO) -> dict[str, Any]:
    return {
        "id": str(group.id),
        "product_id": str(group.product_id),
        "title": group.title,
        "required": group.required,
        "selection": group.selection,
        "min_selections": group.min_selections,
        "max_selections": group.max_selections,
        "sort_index": group.sort_index,
        "is_active": group.is_active,
        "items": [
            {
                "id": str(item.id),
                "label": item.label,
                "price_delta_cents": item.price_delta_cents,
                "sort_index": item.sort_index,
                "is_active": item.is_active,
            }
            for item in group.items
        ],
    }


def _option_item_payload(item: OptionItemDTO) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "label": item.label,
        "price_delta_cents": item.price_delta_cents,
        "sort_index": item.sort_index,
        "is_active": item.is_active,
    }


def _parse_uuid(value: Any, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid {field}") from exc


def _parse_uuid_list(values: Any, field: str) -> list[uuid.UUID]:
    if not isinstance(values, list) or not values:
        raise ValidationError(f"{field} must be a non-empty list of UUIDs")
    return [_parse_uuid(item, field) for item in values]


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _invalidate_menu_cache(ctx: AgentContext) -> None:
    invalidate_restaurant_menu_cache(ctx.uow, ctx.restaurant_id)


def _run_mutation(
    ctx: AgentContext,
    action: Callable[[], Any],
    *,
    summary: str,
    data: dict[str, Any] | None = None,
) -> ToolResult:
    try:
        result = action()
    except NotFoundError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Not found")
    except ValidationError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Validation error")
    except ConflictError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Conflict")
    _invalidate_menu_cache(ctx)
    payload = data if data is not None else {}
    if result is not None and not payload:
        if isinstance(result, CategoryDTO):
            payload = {"category": _category_payload(result)}
        elif isinstance(result, ProductDTO):
            payload = {"product": _product_payload(result)}
        elif isinstance(result, OptionGroupDTO):
            payload = {"option_group": _option_group_payload(result)}
        elif isinstance(result, OptionItemDTO):
            payload = {"option_item": _option_item_payload(result)}
    return ToolResult(ok=True, summary=summary, data=payload)


class MenuWriteSkill:
    id = "menu_write"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="create_category",
                description="Create a new menu category for the current restaurant.",
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "sort_index": {"type": "integer"},
                    },
                    "required": ["name"],
                },
            ),
            ToolDefinition(
                name="update_category",
                description=(
                    "Update a regular or special digital-menu category. Regular categories use "
                    "UUID ids from list_categories; special aisles use virtual ids "
                    f"{DIGITAL_MENU_PROMOTIONS_CATEGORY_ID!r} (promotions) or "
                    f"{DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID!r} (limited-time offers). "
                    "For all types: set name to rename and is_active=false to hide the aisle "
                    "(never delete). Special aisles accept only name and is_active — their "
                    "display_layout is fixed to horizontal and cannot be changed. Regular "
                    "categories also accept description, sort_index, and display_layout "
                    "(vertical | horizontal | grid)."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "category_id": {
                            "type": "string",
                            "description": (
                                "Category UUID, or virtual id for special aisles: "
                                f"{DIGITAL_MENU_PROMOTIONS_CATEGORY_ID} or "
                                f"{DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID}."
                            ),
                        },
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "sort_index": {"type": "integer"},
                        "display_layout": {
                            "type": "string",
                            "enum": ["vertical", "horizontal", "grid"],
                            "description": (
                                "Digital menu product layout. Regular categories only — do not "
                                "pass for special aisles (__dm_promotions__, __dm_limited_time__); "
                                "those always use horizontal."
                            ),
                        },
                        "is_active": {"type": "boolean"},
                    },
                    "required": ["category_id"],
                },
            ),
            ToolDefinition(
                name="create_product",
                description=(
                    "Create a product in one or more categories. Price is in cents."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "price_cents": {"type": "integer"},
                        "category_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "description": {"type": "string"},
                        "currency": {"type": "string"},
                        "is_published": {"type": "boolean"},
                    },
                    "required": ["name", "price_cents", "category_ids"],
                },
            ),
            ToolDefinition(
                name="update_product",
                description=(
                    "Update one product by product_id or name. Set is_active=false to disable "
                    "(never delete). price_cents is in cents (100 MXN = 10000). After the owner "
                    "confirms a product name, pass that exact name — do not reuse a prior "
                    "product_id from an earlier ambiguous match."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "name": {
                            "type": "string",
                            "description": (
                                "Product name to resolve when product_id is omitted, or when "
                                "the owner confirms which product to update."
                            ),
                        },
                        "product_name": {
                            "type": "string",
                            "description": "Alias for name when resolving the product.",
                        },
                        "new_name": {
                            "type": "string",
                            "description": "New display name when renaming the product.",
                        },
                        "description": {"type": "string"},
                        "price_cents": {"type": "integer"},
                        "category_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "currency": {"type": "string"},
                        "is_published": {"type": "boolean"},
                        "is_active": {"type": "boolean"},
                        "approval_status": {
                            "type": "string",
                            "enum": ["draft", "pending", "approved", "rejected"],
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="bulk_update_product_names",
                description=(
                    "Rename MANY products in one call. Each item needs new_name plus "
                    "product_id or product_name/current_name/name to locate the row. "
                    f"Up to {BULK_DEFAULT_LIMIT} items."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "product_name": {"type": "string"},
                                    "current_name": {"type": "string"},
                                    "name": {"type": "string"},
                                    "new_name": {"type": "string"},
                                },
                                "required": ["new_name"],
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_product_descriptions",
                description=(
                    "Update descriptions for MANY products in one call. Each item needs "
                    "description (or text) plus product_id or name. Ideal after listing the "
                    f"catalog with menu_read. Up to {BULK_DEFAULT_LIMIT} items."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "product_name": {"type": "string"},
                                    "description": {"type": "string"},
                                    "text": {"type": "string"},
                                },
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_product_prices",
                description=(
                    "Update prices for MANY products in one call. Each item needs price_cents "
                    "in cents (100 MXN = 10000) plus product_id or name. "
                    f"Up to {BULK_DEFAULT_LIMIT} items."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "product_name": {"type": "string"},
                                    "price_cents": {"type": "integer"},
                                },
                                "required": ["price_cents"],
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_category_names",
                description=bulk_category_tool_description(
                    action="Rename MANY categories in one call."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category_id": {"type": "string"},
                                    "category_name": {"type": "string"},
                                    "current_name": {"type": "string"},
                                    "name": {"type": "string"},
                                    "new_name": {"type": "string"},
                                },
                                "required": ["new_name"],
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_category_descriptions",
                description=bulk_category_tool_description(
                    action="Update descriptions for MANY categories in one call."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category_id": {"type": "string"},
                                    "category_name": {"type": "string"},
                                    "name": {"type": "string"},
                                    "description": {"type": "string"},
                                    "text": {"type": "string"},
                                },
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_category_sort_indices",
                description=bulk_category_tool_description(
                    action="Set sort_index for MANY categories in one call."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category_id": {"type": "string"},
                                    "category_name": {"type": "string"},
                                    "name": {"type": "string"},
                                    "sort_index": {"type": "integer"},
                                },
                                "required": ["sort_index"],
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_category_visibility",
                description=bulk_category_tool_description(
                    action=(
                        "Show or hide MANY categories in one call (is_active=false hides; "
                        "never delete). Works for regular UUID categories and special aisles "
                        f"{DIGITAL_MENU_PROMOTIONS_CATEGORY_ID!r} / "
                        f"{DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID!r}."
                    )
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category_id": {"type": "string"},
                                    "category_name": {"type": "string"},
                                    "name": {"type": "string"},
                                    "is_active": {"type": "boolean"},
                                    "visible": {"type": "boolean"},
                                },
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="bulk_update_category_display_layout",
                description=bulk_category_tool_description(
                    action=(
                        "Set digital-menu display_layout (vertical | horizontal | grid) for "
                        "MANY regular categories in one call. Does not apply to special aisles."
                    )
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category_id": {"type": "string"},
                                    "category_name": {"type": "string"},
                                    "name": {"type": "string"},
                                    "display_layout": {
                                        "type": "string",
                                        "enum": ["vertical", "horizontal", "grid"],
                                    },
                                },
                                "required": ["display_layout"],
                            },
                        }
                    },
                    "required": ["items"],
                },
            ),
            ToolDefinition(
                name="set_category_product_order",
                description=(
                    "Reorder products within one regular category (UUID from list_categories). "
                    "Pass the full ordered product_ids list. You may pass only the active "
                    "products in the desired order (as returned by menu_read list_products); "
                    "any inactive products still linked to the category are kept at the end "
                    "automatically. Do not use for special aisles (__dm_promotions__, "
                    "__dm_limited_time__)."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "category_id": {"type": "string"},
                        "category_name": {
                            "type": "string",
                            "description": "Resolve category when category_id is omitted.",
                        },
                        "product_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "All active products in desired order, or every linked product id."
                            ),
                        },
                    },
                    "required": ["product_ids"],
                },
            ),
            ToolDefinition(
                name="add_option_group",
                description="Add an option group (size, extras, etc.) to a product.",
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "title": {"type": "string"},
                        "required": {"type": "boolean"},
                        "selection": {
                            "type": "string",
                            "enum": ["single", "multi"],
                        },
                        "min_selections": {"type": "integer"},
                        "max_selections": {"type": "integer"},
                        "sort_index": {"type": "integer"},
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "price_delta_cents": {"type": "integer"},
                                    "sort_index": {"type": "integer"},
                                },
                                "required": ["label"],
                            },
                        },
                    },
                    "required": ["product_id", "title"],
                },
            ),
            ToolDefinition(
                name="update_option_group",
                description="Update an option group. Set is_active=false to disable.",
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "group_id": {"type": "string"},
                        "title": {"type": "string"},
                        "required": {"type": "boolean"},
                        "selection": {
                            "type": "string",
                            "enum": ["single", "multi"],
                        },
                        "min_selections": {"type": "integer"},
                        "max_selections": {"type": "integer"},
                        "sort_index": {"type": "integer"},
                        "is_active": {"type": "boolean"},
                    },
                    "required": ["product_id", "group_id"],
                },
            ),
            ToolDefinition(
                name="add_option_item",
                description="Add one option item to an existing option group.",
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "group_id": {"type": "string"},
                        "label": {"type": "string"},
                        "price_delta_cents": {"type": "integer"},
                        "sort_index": {"type": "integer"},
                    },
                    "required": ["product_id", "group_id", "label"],
                },
            ),
            ToolDefinition(
                name="update_option_item",
                description="Update an option item. Set is_active=false to disable.",
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string"},
                        "group_id": {"type": "string"},
                        "item_id": {"type": "string"},
                        "label": {"type": "string"},
                        "price_delta_cents": {"type": "integer"},
                        "sort_index": {"type": "integer"},
                        "is_active": {"type": "boolean"},
                    },
                    "required": ["product_id", "group_id", "item_id"],
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        service = MenuService(ctx.uow.menu)
        restaurant_id = ctx.restaurant_id

        if tool_name == "create_category":
            name = _optional_str(args.get("name"))
            if not name:
                return ToolResult(ok=False, summary="name is required")
            sort_index = int(args.get("sort_index", 0) or 0)

            def action() -> CategoryDTO:
                return service.create_category(
                    CategoryCreate(
                        restaurant_id=restaurant_id,
                        name=name,
                        description=_optional_str(args.get("description")),
                        sort_index=sort_index,
                    )
                )

            return _run_mutation(ctx, action, summary=f"Created category {name!r}")

        if tool_name == "update_category":
            category_id_raw = args.get("category_id")
            if not category_id_raw:
                return ToolResult(ok=False, summary="category_id is required")
            category_id_str = str(category_id_raw).strip()
            if _is_special_category_id(category_id_str):
                return _update_special_category(ctx, category_id_str, args)

            try:
                category_id = _parse_uuid(category_id_str, "category_id")
            except ValidationError as exc:
                return ToolResult(ok=False, summary=str(exc))

            update_fields: dict[str, Any] = {}
            if "name" in args:
                update_fields["name"] = _optional_str(args.get("name"))
            if "description" in args:
                update_fields["description"] = _optional_str(args.get("description"))
            if "sort_index" in args:
                update_fields["sort_index"] = int(args["sort_index"])
            if "display_layout" in args:
                try:
                    update_fields["display_layout"] = _parse_display_layout(args.get("display_layout"))
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            if "is_active" in args:
                update_fields["is_active"] = bool(args["is_active"])
            if not update_fields:
                return ToolResult(ok=False, summary="Provide at least one field to update")

            def action() -> CategoryDTO:
                return service.update_category(
                    restaurant_id,
                    category_id,
                    CategoryUpdate(**update_fields),
                )

            return _run_mutation(ctx, action, summary="Updated category")

        if tool_name == "create_product":
            name = _optional_str(args.get("name"))
            if not name:
                return ToolResult(ok=False, summary="name is required")
            try:
                price_cents = int(args.get("price_cents"))
                category_ids = _parse_uuid_list(args.get("category_ids"), "category_ids")
            except (TypeError, ValueError, ValidationError) as exc:
                return ToolResult(ok=False, summary=str(exc))

            def action() -> ProductDTO:
                return service.create_product(
                    restaurant_id,
                    ProductCreate(
                        restaurant_id=restaurant_id,
                        name=name,
                        description=_optional_str(args.get("description")),
                        price_cents=price_cents,
                        currency=str(args.get("currency") or "MXN"),
                        is_published=bool(args.get("is_published", False)),
                        category_ids=category_ids,
                    ),
                )

            return _run_mutation(ctx, action, summary=f"Created product {name!r}")

        if tool_name == "update_product":
            product_id, resolve_error = _resolve_product_id_for_write(service, ctx, args)
            if resolve_error is not None:
                return resolve_error
            assert product_id is not None

            update_fields: dict[str, Any] = {}
            if "name" in args and args.get("product_id"):
                update_fields["name"] = _optional_str(args.get("name"))
            elif "new_name" in args:
                update_fields["name"] = _optional_str(args.get("new_name"))
            if "description" in args:
                update_fields["description"] = _optional_str(args.get("description"))
            if "price_cents" in args:
                update_fields["price_cents"] = int(args["price_cents"])
            if "currency" in args:
                update_fields["currency"] = str(args["currency"])
            if "is_published" in args:
                update_fields["is_published"] = bool(args["is_published"])
            if "is_active" in args:
                update_fields["is_active"] = bool(args["is_active"])
            if "approval_status" in args:
                update_fields["approval_status"] = str(args["approval_status"])
            if "category_ids" in args:
                try:
                    update_fields["category_ids"] = _parse_uuid_list(
                        args.get("category_ids"), "category_ids"
                    )
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            if not update_fields:
                return ToolResult(ok=False, summary="Provide at least one field to update")

            def action() -> ProductDTO:
                return service.update_product(
                    restaurant_id,
                    product_id,
                    ProductUpdate(**update_fields),
                )

            return _run_mutation(ctx, action, summary="Updated product")

        if tool_name == "bulk_update_product_names":
            return bulk_update_product_names(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_product_descriptions":
            return bulk_update_product_descriptions(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_product_prices":
            return bulk_update_product_prices(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_category_names":
            return bulk_update_category_names(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_category_descriptions":
            return bulk_update_category_descriptions(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_category_sort_indices":
            return bulk_update_category_sort_indices(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_category_visibility":
            return bulk_update_category_visibility(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )
        if tool_name == "bulk_update_category_display_layout":
            return bulk_update_category_display_layout(
                service, ctx, args, invalidate=_invalidate_menu_cache
            )

        if tool_name == "set_category_product_order":
            try:
                product_ids = _parse_uuid_list(args.get("product_ids"), "product_ids")
            except ValidationError as exc:
                return ToolResult(ok=False, summary=str(exc))

            category_id: uuid.UUID | None = None
            category_id_raw = args.get("category_id")
            if category_id_raw:
                category_id_str = str(category_id_raw).strip()
                if _is_special_category_id(category_id_str):
                    return ToolResult(
                        ok=False,
                        summary="Special categories cannot be reordered with this tool",
                    )
                try:
                    category_id = _parse_uuid(category_id_str, "category_id")
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            else:
                category_name = _optional_str(args.get("category_name"))
                if not category_name:
                    return ToolResult(
                        ok=False,
                        summary="Provide category_id or category_name",
                    )
                page = service.list_all_categories(
                    restaurant_id,
                    PaginationParams(limit=200, cursor=None),
                )
                needle = category_name.casefold()
                matches = [
                    category
                    for category in page.items
                    if category.name.casefold() == needle
                ]
                if len(matches) != 1:
                    if len(matches) > 1:
                        labels = ", ".join(category.name for category in matches[:5])
                        return ToolResult(
                            ok=False,
                            summary=(
                                f"Ambiguous category name {category_name!r}; "
                                f"candidates: {labels}"
                            ),
                        )
                    return ToolResult(
                        ok=False,
                        summary=f"Category not found for name {category_name!r}",
                    )
                category_id = matches[0].id

            assert category_id is not None

            def action() -> None:
                service.set_category_product_order(
                    restaurant_id,
                    category_id,
                    CategoryProductOrderUpdate(product_ids=product_ids),
                )

            return _run_mutation(
                ctx,
                action,
                summary=f"Reordered {len(product_ids)} products in category",
                data={
                    "category_id": str(category_id),
                    "product_ids": [str(product_id) for product_id in product_ids],
                },
            )

        if tool_name == "add_option_group":
            try:
                product_id = _parse_uuid(args.get("product_id"), "product_id")
            except ValidationError as exc:
                return ToolResult(ok=False, summary=str(exc))
            title = _optional_str(args.get("title"))
            if not title:
                return ToolResult(ok=False, summary="title is required")

            items_raw = args.get("items") or []
            items: list[OptionItemCreate] = []
            if items_raw:
                if not isinstance(items_raw, list):
                    return ToolResult(ok=False, summary="items must be a list")
                for entry in items_raw:
                    if not isinstance(entry, dict):
                        return ToolResult(ok=False, summary="Each item must be an object")
                    label = _optional_str(entry.get("label"))
                    if not label:
                        return ToolResult(ok=False, summary="Each item requires a label")
                    items.append(
                        OptionItemCreate(
                            label=label,
                            price_delta_cents=int(entry.get("price_delta_cents", 0) or 0),
                            sort_index=int(entry.get("sort_index", 0) or 0),
                        )
                    )

            def action() -> OptionGroupDTO:
                return service.add_option_group(
                    restaurant_id,
                    product_id,
                    OptionGroupCreate(
                        title=title,
                        required=bool(args.get("required", False)),
                        selection=str(args.get("selection") or "single"),
                        min_selections=int(args.get("min_selections", 0) or 0),
                        max_selections=(
                            int(args["max_selections"])
                            if args.get("max_selections") is not None
                            else None
                        ),
                        sort_index=int(args.get("sort_index", 0) or 0),
                        items=items,
                    ),
                )

            return _run_mutation(ctx, action, summary=f"Added option group {title!r}")

        if tool_name == "update_option_group":
            try:
                product_id = _parse_uuid(args.get("product_id"), "product_id")
                group_id = _parse_uuid(args.get("group_id"), "group_id")
            except ValidationError as exc:
                return ToolResult(ok=False, summary=str(exc))

            update_fields: dict[str, Any] = {}
            if "title" in args:
                update_fields["title"] = _optional_str(args.get("title"))
            if "required" in args:
                update_fields["required"] = bool(args["required"])
            if "selection" in args:
                update_fields["selection"] = str(args["selection"])
            if "min_selections" in args:
                update_fields["min_selections"] = int(args["min_selections"])
            if "max_selections" in args:
                update_fields["max_selections"] = int(args["max_selections"])
            if "sort_index" in args:
                update_fields["sort_index"] = int(args["sort_index"])
            if "is_active" in args:
                update_fields["is_active"] = bool(args["is_active"])
            if not update_fields:
                return ToolResult(ok=False, summary="Provide at least one field to update")

            def action() -> OptionGroupDTO:
                return service.update_option_group(
                    restaurant_id,
                    product_id,
                    group_id,
                    OptionGroupUpdate(**update_fields),
                )

            return _run_mutation(ctx, action, summary="Updated option group")

        if tool_name == "add_option_item":
            try:
                product_id = _parse_uuid(args.get("product_id"), "product_id")
                group_id = _parse_uuid(args.get("group_id"), "group_id")
            except ValidationError as exc:
                return ToolResult(ok=False, summary=str(exc))
            label = _optional_str(args.get("label"))
            if not label:
                return ToolResult(ok=False, summary="label is required")

            def action() -> OptionItemDTO:
                return service.add_option_item(
                    restaurant_id,
                    product_id,
                    group_id,
                    OptionItemCreate(
                        label=label,
                        price_delta_cents=int(args.get("price_delta_cents", 0) or 0),
                        sort_index=int(args.get("sort_index", 0) or 0),
                    ),
                )

            return _run_mutation(ctx, action, summary=f"Added option item {label!r}")

        if tool_name == "update_option_item":
            try:
                product_id = _parse_uuid(args.get("product_id"), "product_id")
                group_id = _parse_uuid(args.get("group_id"), "group_id")
                item_id = _parse_uuid(args.get("item_id"), "item_id")
            except ValidationError as exc:
                return ToolResult(ok=False, summary=str(exc))

            update_fields: dict[str, Any] = {}
            if "label" in args:
                update_fields["label"] = _optional_str(args.get("label"))
            if "price_delta_cents" in args:
                update_fields["price_delta_cents"] = int(args["price_delta_cents"])
            if "sort_index" in args:
                update_fields["sort_index"] = int(args["sort_index"])
            if "is_active" in args:
                update_fields["is_active"] = bool(args["is_active"])
            if not update_fields:
                return ToolResult(ok=False, summary="Provide at least one field to update")

            def action() -> OptionItemDTO:
                return service.update_option_item(
                    restaurant_id,
                    product_id,
                    group_id,
                    item_id,
                    OptionItemUpdate(**update_fields),
                )

            return _run_mutation(ctx, action, summary="Updated option item")

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
