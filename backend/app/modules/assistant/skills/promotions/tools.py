"""promotions skill — create and manage marketing promotions."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import PaginationParams
from app.modules.assistant.skills.context import AgentContext, commit_agent_mutation
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_read.promotions import (
    promotion_display_name,
    promotion_payload,
)
from app.modules.assistant.skills.menu_read.search import STRONG_MATCH_THRESHOLD
from app.modules.assistant.skills.menu_read.tools import (
    PROMOTION_SCAN_LIMIT,
    _promotion_name_maps,
    _restaurant_timezone,
    _score_promotions,
)
from app.modules.assistant.skills.product_resolve import resolve_product
from app.modules.assistant.skills.promotions.banner_generate import (
    generate_and_attach_promotion_banner,
)
from app.modules.menu.service import MenuService
from app.modules.promotions.schemas import (
    PromotionBundle,
    PromotionCreate,
    PromotionDTO,
    PromotionScheduleInput,
    PromotionUpdate,
    enrich_promotion_dto,
)
from app.modules.promotions.service import PromotionService
from app.modules.promotions.types import normalize_promotion_type
from app.modules.promotions.option_item_sync import (
    collect_option_items_for_products,
    is_nxm_bundle_promo,
    sync_option_items_for_product_change,
)


def _parse_uuid(value: Any, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid {field}") from exc


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_datetime(value: Any, field: str) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"Invalid {field}; use ISO 8601") from exc


def _parse_uuid_list(values: Any, field: str) -> list[uuid.UUID]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValidationError(f"{field} must be a list")
    return [_parse_uuid(item, field) for item in values]


def _default_promotion_image(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/assistant/promo-banner-placeholder.png"


def _parse_bundle(args: dict[str, Any]) -> PromotionBundle | None:
    raw = args.get("bundle")
    if raw is None:
        get_q = args.get("get_quantity")
        pay_q = args.get("pay_quantity")
        pairing = args.get("pairing_mode")
        if get_q is None and pay_q is None and pairing is None:
            return None
        return PromotionBundle(
            get_quantity=int(get_q or 2),
            pay_quantity=int(pay_q or 1),
            pairing_mode=str(pairing or "cross_product"),
        )
    if not isinstance(raw, dict):
        raise ValidationError("bundle must be an object")
    return PromotionBundle(
        get_quantity=int(raw.get("get_quantity", 2)),
        pay_quantity=int(raw.get("pay_quantity", 1)),
        pairing_mode=str(raw.get("pairing_mode", "cross_product")),
    )


def _parse_schedule(args: dict[str, Any]) -> PromotionScheduleInput | None:
    raw = args.get("schedule")
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValidationError("schedule must be an object")
    weekdays = raw.get("weekdays") or []
    if not isinstance(weekdays, list):
        raise ValidationError("schedule.weekdays must be a list")
    return PromotionScheduleInput(
        weekdays=[int(day) for day in weekdays],
        use_time_window=bool(raw.get("use_time_window", False)),
        daily_start_time=_optional_str(raw.get("daily_start_time")),
        daily_end_time=_optional_str(raw.get("daily_end_time")),
    )


def _resolve_product_ids(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
) -> tuple[list[uuid.UUID], ToolResult | None]:
    if args.get("product_ids") is not None:
        try:
            return _parse_uuid_list(args.get("product_ids"), "product_ids"), None
        except ValidationError as exc:
            return [], ToolResult(ok=False, summary=str(exc))

    names = args.get("product_names")
    if names is None:
        return [], None
    if not isinstance(names, list) or not names:
        return [], ToolResult(ok=False, summary="product_names must be a non-empty list")

    product_ids: list[uuid.UUID] = []
    for name in names:
        label = _optional_str(name)
        if not label:
            return [], ToolResult(ok=False, summary="Each product_names entry must be a string")
        resolved = resolve_product(menu, ctx.restaurant_id, label)
        if resolved.status == "found" and resolved.product is not None:
            product_ids.append(resolved.product.id)
            continue
        if resolved.status == "ambiguous":
            candidates = [
                {"id": str(product.id), "name": product.name}
                for _, product in resolved.matches[:5]
            ]
            return [], ToolResult(
                ok=False,
                summary=f"Ambiguous product name {label!r}; choose one by id",
                data={"candidates": candidates, "ambiguous": True},
            )
        return [], ToolResult(
            ok=False,
            summary=f"No product matched name {label!r}",
            data={"query": label},
        )
    return product_ids, None


def _resolve_category_ids(
    menu: MenuService,
    ctx: AgentContext,
    args: dict[str, Any],
) -> tuple[list[uuid.UUID], ToolResult | None]:
    if args.get("category_ids") is not None:
        try:
            return _parse_uuid_list(args.get("category_ids"), "category_ids"), None
        except ValidationError as exc:
            return [], ToolResult(ok=False, summary=str(exc))

    names = args.get("category_names")
    if names is None:
        return [], None
    if not isinstance(names, list) or not names:
        return [], ToolResult(ok=False, summary="category_names must be a non-empty list")

    page = menu.list_all_categories(
        ctx.restaurant_id,
        PaginationParams(limit=200, cursor=None),
    )
    category_ids: list[uuid.UUID] = []
    for name in names:
        label = _optional_str(name)
        if not label:
            return [], ToolResult(ok=False, summary="Each category_names entry must be a string")
        needle = label.casefold()
        matches = [category for category in page.items if category.name.casefold() == needle]
        if len(matches) != 1:
            if len(matches) > 1:
                labels = ", ".join(category.name for category in matches[:5])
                return [], ToolResult(
                    ok=False,
                    summary=f"Ambiguous category name {label!r}; candidates: {labels}",
                )
            return [], ToolResult(
                ok=False,
                summary=f"Category not found for name {label!r}",
            )
        category_ids.append(matches[0].id)
    return category_ids, None


def _resolve_promotion(
    promo_service: PromotionService,
    ctx: AgentContext,
    args: dict[str, Any],
) -> tuple[PromotionDTO | None, ToolResult | None]:
    promotion_id_raw = args.get("promotion_id")
    if promotion_id_raw:
        try:
            promotion_id = _parse_uuid(promotion_id_raw, "promotion_id")
        except ValidationError as exc:
            return None, ToolResult(ok=False, summary=str(exc))
        try:
            return promo_service.get(ctx.restaurant_id, promotion_id), None
        except NotFoundError:
            return None, ToolResult(ok=False, summary="Promotion not found")

    name_raw = args.get("name") or args.get("promotion_name") or args.get("query")
    if not name_raw:
        return None, ToolResult(ok=False, summary="Provide promotion_id or name")

    query = str(name_raw).strip()
    timezone = _restaurant_timezone(ctx)
    page = promo_service.list_for_admin(
        ctx.restaurant_id,
        PaginationParams(limit=PROMOTION_SCAN_LIMIT),
        timezone=timezone,
    )
    scored = _score_promotions(query, list(page.items))
    strong = [pair for pair in scored if pair[0] >= STRONG_MATCH_THRESHOLD]
    if strong:
        return strong[0][1], None
    suggestions = [
        {
            "id": str(promo.id),
            "name": promotion_display_name(promo),
            "match_score": round(score, 3),
        }
        for score, promo in scored[:5]
    ]
    if suggestions:
        return None, ToolResult(
            ok=False,
            summary=f"No confident match for {query!r}; see suggestions",
            data={"suggestions": suggestions, "query": query},
        )
    return None, ToolResult(
        ok=False,
        summary=f"No promotion matched {query!r}",
        data={"query": query},
    )


def _promotion_result(
    promo: PromotionDTO,
    *,
    menu: MenuService,
    ctx: AgentContext,
    summary: str,
    extra: dict[str, Any] | None = None,
) -> ToolResult:
    timezone = _restaurant_timezone(ctx)
    promo_service = PromotionService(ctx.uow.promotions)
    promo = promo_service.get(ctx.restaurant_id, promo.id)
    promo = enrich_promotion_dto(promo)
    product_names, category_names = _promotion_name_maps(menu, ctx.restaurant_id)
    data: dict[str, Any] = {
        "promotion": promotion_payload(
            promo,
            product_names=product_names,
            category_names=category_names,
        )
    }
    if extra:
        data.update(extra)
    return ToolResult(ok=True, summary=summary, data=data)


def _invalidate_menu_cache(ctx: AgentContext) -> None:
    invalidate_restaurant_menu_cache(ctx.uow, ctx.restaurant_id)


def _run_mutation(
    ctx: AgentContext,
    menu: MenuService,
    action: Callable[[], PromotionDTO],
    *,
    summary: str,
    extra: dict[str, Any] | None = None,
) -> ToolResult:
    try:
        promo = action()
    except NotFoundError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Not found")
    except ValidationError as exc:
        return ToolResult(ok=False, summary=str(exc) or "Validation error")
    _invalidate_menu_cache(ctx)
    commit_agent_mutation(ctx)
    return _promotion_result(promo, menu=menu, ctx=ctx, summary=summary, extra=extra)


def _build_promotion_create(
    ctx: AgentContext,
    menu: MenuService,
    args: dict[str, Any],
) -> tuple[PromotionCreate | None, bool, ToolResult | None]:
    name = _optional_str(args.get("name"))
    if not name:
        return None, False, ToolResult(ok=False, summary="name is required")

    promo_type = _optional_str(args.get("type"))
    if not promo_type:
        return None, False, ToolResult(ok=False, summary="type is required")
    try:
        normalized_type = normalize_promotion_type(promo_type)
    except ValueError as exc:
        return None, False, ToolResult(ok=False, summary=str(exc))

    scope = _optional_str(args.get("scope"))
    if not scope:
        return None, False, ToolResult(ok=False, summary="scope is required")

    product_ids, product_err = _resolve_product_ids(menu, ctx, args)
    if product_err:
        return None, False, product_err
    category_ids, category_err = _resolve_category_ids(menu, ctx, args)
    if category_err:
        return None, False, category_err

    try:
        option_item_ids = _parse_uuid_list(args.get("option_item_ids"), "option_item_ids")
    except ValidationError as exc:
        return None, False, ToolResult(ok=False, summary=str(exc))

    bundle = _parse_bundle(args)
    if normalized_type == "two_for_one" and bundle is None:
        bundle = PromotionBundle(get_quantity=2, pay_quantity=1)

    try:
        schedule = _parse_schedule(args)
    except ValidationError as exc:
        return None, False, ToolResult(ok=False, summary=str(exc))

    image_path = _optional_str(args.get("image_path"))
    used_placeholder = False
    if not image_path:
        image_path = _default_promotion_image(ctx.restaurant_id)
        used_placeholder = True

    try:
        starts_at = _parse_datetime(args.get("starts_at"), "starts_at")
        ends_at = _parse_datetime(args.get("ends_at"), "ends_at")
    except ValidationError as exc:
        return None, False, ToolResult(ok=False, summary=str(exc))

    percent = args.get("percent")
    amount_cents = args.get("amount_cents")
    min_order_cents = args.get("min_order_cents")

    is_nxm = normalized_type == "two_for_one" or bundle is not None
    if (
        is_nxm
        and scope in ("product", "category")
        and product_ids
        and not option_item_ids
        and args.get("option_item_ids") is None
    ):
        option_item_ids = collect_option_items_for_products(menu, ctx.restaurant_id, product_ids)

    create = PromotionCreate(
        restaurant_id=ctx.restaurant_id,
        name=name,
        image_path=image_path,
        type=normalized_type or promo_type,
        scope=scope,
        percent=int(percent) if percent is not None else None,
        amount_cents=int(amount_cents) if amount_cents is not None else None,
        min_order_cents=int(min_order_cents) if min_order_cents is not None else None,
        starts_at=starts_at,
        ends_at=ends_at,
        bundle=bundle,
        schedule=schedule,
        product_ids=product_ids,
        category_ids=category_ids,
        option_item_ids=option_item_ids,
    )
    return create, used_placeholder, None


class PromotionsSkill:
    id = "promotions"

    def tool_definitions(self) -> list[ToolDefinition]:
        target_props = {
            "product_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Product UUIDs targeted by the promo.",
            },
            "product_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Resolve products by exact name when UUIDs are unknown.",
            },
            "category_ids": {
                "type": "array",
                "items": {"type": "string"},
            },
            "category_names": {
                "type": "array",
                "items": {"type": "string"},
            },
            "option_item_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "For NxM: allow-list of participating add-ons (empty = all).",
            },
        }
        schedule_props = {
            "schedule": {
                "type": "object",
                "properties": {
                    "weekdays": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "0=Mon … 6=Sun",
                    },
                    "use_time_window": {"type": "boolean"},
                    "daily_start_time": {"type": "string", "description": "HH:MM"},
                    "daily_end_time": {"type": "string", "description": "HH:MM"},
                },
            },
        }
        bundle_props = {
            "bundle": {
                "type": "object",
                "properties": {
                    "get_quantity": {"type": "integer", "description": "Units customer gets (e.g. 2)."},
                    "pay_quantity": {"type": "integer", "description": "Units customer pays for (e.g. 1)."},
                    "pairing_mode": {
                        "type": "string",
                        "enum": ["cross_product", "same_product"],
                    },
                },
            },
            "get_quantity": {"type": "integer"},
            "pay_quantity": {"type": "integer"},
            "pairing_mode": {
                "type": "string",
                "enum": ["cross_product", "same_product"],
            },
        }

        return [
            ToolDefinition(
                name="create_promotion",
                description=(
                    "Create a marketing promotion (2×1/NxM bundle, combo badge, percent, or amount). "
                    "Call only after the owner confirmed the secretary onboarding recap (type, name, "
                    "scope, targets when required, discount rule). Requires name, type, and scope. "
                    "Link targets with product_ids/product_names or category_ids/category_names. "
                    "Uses a placeholder banner if image_path is omitted."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {
                            "type": "string",
                            "enum": ["bundle", "2x1", "combo", "percent", "amount"],
                        },
                        "scope": {
                            "type": "string",
                            "enum": ["product", "category", "order"],
                        },
                        "image_path": {
                            "type": "string",
                            "description": "Storage path for the promo banner (recommended).",
                        },
                        "percent": {"type": "integer"},
                        "amount_cents": {"type": "integer"},
                        "min_order_cents": {"type": "integer"},
                        "starts_at": {"type": "string", "description": "ISO 8601 start datetime."},
                        "ends_at": {"type": "string", "description": "ISO 8601 end datetime."},
                        **target_props,
                        **schedule_props,
                        **bundle_props,
                    },
                    "required": ["name", "type", "scope"],
                },
            ),
            ToolDefinition(
                name="update_promotion",
                description=(
                    "Update an existing promotion. Provide promotion_id or name plus fields to change."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "promotion_id": {"type": "string"},
                        "name": {"type": "string", "description": "Lookup by promo name when no id."},
                        "new_name": {"type": "string", "description": "Rename the promotion."},
                        "image_path": {"type": "string"},
                        "type": {
                            "type": "string",
                            "enum": ["bundle", "2x1", "combo", "percent", "amount"],
                        },
                        "scope": {
                            "type": "string",
                            "enum": ["product", "category", "order"],
                        },
                        "percent": {"type": "integer"},
                        "amount_cents": {"type": "integer"},
                        "min_order_cents": {"type": "integer"},
                        "starts_at": {"type": "string"},
                        "ends_at": {"type": "string"},
                        **target_props,
                        **schedule_props,
                        **bundle_props,
                    },
                },
            ),
            ToolDefinition(
                name="set_promotion_targets",
                description=(
                    "Replace products, categories, or option items linked to a promotion. "
                    "Provide promotion_id or name. Only supplied lists are updated."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "promotion_id": {"type": "string"},
                        "name": {"type": "string"},
                        **target_props,
                    },
                },
            ),
            ToolDefinition(
                name="generate_promotion_banner",
                description=(
                    "Generate a 16:9 AI marketing banner for ONE promotion (delivery-app style: "
                    "¡PROMO! badge, headline, 2X1/offer text, food photo, optional countdown), "
                    "upload to storage, and set promotion image_path. Resolve promo by "
                    "promotion_id or name. Skips promos that already have a real banner unless "
                    "force=true. Requires owner confirmation before calling."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "promotion_id": {"type": "string"},
                        "name": {
                            "type": "string",
                            "description": "Promotion name when promotion_id is omitted.",
                        },
                        "headline": {
                            "type": "string",
                            "description": "Optional uppercase headline override (defaults to promo name).",
                        },
                        "offer_label": {
                            "type": "string",
                            "description": "Optional offer text override (e.g. 2X1, -15%).",
                        },
                        "cta_text": {
                            "type": "string",
                            "description": "Call-to-action strip text (default ¡APROVECHA!).",
                        },
                        "show_countdown": {
                            "type": "boolean",
                            "description": "Show countdown badge; defaults true when promo has ends_at.",
                        },
                        "style_notes": {
                            "type": "string",
                            "description": "Optional extra art direction for the banner.",
                        },
                        "force": {
                            "type": "boolean",
                            "description": "Replace an existing non-placeholder banner.",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="disable_promotion",
                description=(
                    "Disable a promotion (soft delete). Provide promotion_id or name. "
                    "Does not remove records from the database."
                ),
                effect="mutate",
                input_schema={
                    "type": "object",
                    "properties": {
                        "promotion_id": {"type": "string"},
                        "name": {"type": "string"},
                    },
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        menu = MenuService(ctx.uow.menu)
        promo_service = PromotionService(ctx.uow.promotions)
        timezone = _restaurant_timezone(ctx)

        if tool_name == "create_promotion":
            create, used_placeholder, build_err = _build_promotion_create(ctx, menu, args)
            if build_err:
                return build_err
            assert create is not None

            def action() -> PromotionDTO:
                return promo_service.create(ctx.restaurant_id, create)

            extra = {"used_placeholder_banner": True} if used_placeholder else None
            return _run_mutation(
                ctx,
                menu,
                action,
                summary=f"Created promotion {create.name!r}",
                extra=extra,
            )

        if tool_name == "update_promotion":
            promo, resolve_err = _resolve_promotion(promo_service, ctx, args)
            if resolve_err:
                return resolve_err
            assert promo is not None

            update_fields: dict[str, Any] = {}
            new_name = _optional_str(args.get("new_name"))
            if new_name:
                update_fields["name"] = new_name
            if "image_path" in args:
                update_fields["image_path"] = _optional_str(args.get("image_path"))
            if "type" in args:
                try:
                    update_fields["type"] = normalize_promotion_type(str(args["type"]))
                except ValueError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            if "scope" in args:
                update_fields["scope"] = str(args["scope"])
            if "percent" in args:
                update_fields["percent"] = int(args["percent"])
            if "amount_cents" in args:
                update_fields["amount_cents"] = int(args["amount_cents"])
            if "min_order_cents" in args:
                update_fields["min_order_cents"] = int(args["min_order_cents"])
            if "starts_at" in args:
                try:
                    update_fields["starts_at"] = _parse_datetime(args.get("starts_at"), "starts_at")
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            if "ends_at" in args:
                try:
                    update_fields["ends_at"] = _parse_datetime(args.get("ends_at"), "ends_at")
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            if "bundle" in args or "get_quantity" in args or "pay_quantity" in args or "pairing_mode" in args:
                try:
                    update_fields["bundle"] = _parse_bundle(args)
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))
            if "schedule" in args:
                try:
                    update_fields["schedule"] = _parse_schedule(args)
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))

            if any(key in args for key in ("product_ids", "product_names")):
                product_ids, product_err = _resolve_product_ids(menu, ctx, args)
                if product_err:
                    return product_err
                update_fields["product_ids"] = product_ids
                if (
                    "option_item_ids" not in args
                    and is_nxm_bundle_promo(promo)
                    and product_ids is not None
                ):
                    update_fields["option_item_ids"] = sync_option_items_for_product_change(
                        menu,
                        ctx.restaurant_id,
                        previous_product_ids=promo.product_ids,
                        new_product_ids=product_ids,
                        current_option_item_ids=promo.option_item_ids,
                    )
            if any(key in args for key in ("category_ids", "category_names")):
                category_ids, category_err = _resolve_category_ids(menu, ctx, args)
                if category_err:
                    return category_err
                update_fields["category_ids"] = category_ids
            if "option_item_ids" in args:
                try:
                    update_fields["option_item_ids"] = _parse_uuid_list(
                        args.get("option_item_ids"), "option_item_ids"
                    )
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))

            if not update_fields:
                return ToolResult(ok=False, summary="Provide at least one field to update")

            promotion_id = promo.id

            def action() -> PromotionDTO:
                return promo_service.update(
                    ctx.restaurant_id,
                    promotion_id,
                    PromotionUpdate(**update_fields),
                    timezone=timezone,
                )

            return _run_mutation(
                ctx,
                menu,
                action,
                summary=f"Updated promotion {promotion_display_name(promo)!r}",
            )

        if tool_name == "set_promotion_targets":
            promo, resolve_err = _resolve_promotion(promo_service, ctx, args)
            if resolve_err:
                return resolve_err
            assert promo is not None

            product_ids: list[uuid.UUID] | None = None
            category_ids: list[uuid.UUID] | None = None
            option_item_ids: list[uuid.UUID] | None = None

            if any(key in args for key in ("product_ids", "product_names")):
                resolved_products, product_err = _resolve_product_ids(menu, ctx, args)
                if product_err:
                    return product_err
                product_ids = resolved_products
                if "option_item_ids" not in args and is_nxm_bundle_promo(promo):
                    option_item_ids = sync_option_items_for_product_change(
                        menu,
                        ctx.restaurant_id,
                        previous_product_ids=promo.product_ids,
                        new_product_ids=product_ids,
                        current_option_item_ids=promo.option_item_ids,
                    )
            if any(key in args for key in ("category_ids", "category_names")):
                resolved_categories, category_err = _resolve_category_ids(menu, ctx, args)
                if category_err:
                    return category_err
                category_ids = resolved_categories
            if "option_item_ids" in args:
                try:
                    option_item_ids = _parse_uuid_list(args.get("option_item_ids"), "option_item_ids")
                except ValidationError as exc:
                    return ToolResult(ok=False, summary=str(exc))

            if product_ids is None and category_ids is None and option_item_ids is None:
                return ToolResult(
                    ok=False,
                    summary=(
                        "Provide product_ids/product_names, category_ids/category_names, "
                        "or option_item_ids"
                    ),
                )

            promotion_id = promo.id

            def action() -> PromotionDTO:
                if product_ids is not None:
                    promo_service.set_products(ctx.restaurant_id, promotion_id, product_ids)
                if category_ids is not None:
                    promo_service.set_categories(ctx.restaurant_id, promotion_id, category_ids)
                if option_item_ids is not None:
                    promo_service.set_option_items(
                        ctx.restaurant_id, promotion_id, option_item_ids
                    )
                return promo_service.get(ctx.restaurant_id, promotion_id)

            return _run_mutation(
                ctx,
                menu,
                action,
                summary=f"Updated targets for {promotion_display_name(promo)!r}",
            )

        if tool_name == "generate_promotion_banner":
            promo, resolve_err = _resolve_promotion(promo_service, ctx, args)
            if resolve_err:
                return resolve_err
            assert promo is not None
            product_names_map, category_names_map = _promotion_name_maps(menu, ctx.restaurant_id)
            show_countdown = args.get("show_countdown")
            result = generate_and_attach_promotion_banner(
                ctx=ctx,
                promo_service=promo_service,
                promo=promo,
                product_names_map=product_names_map,
                category_names_map=category_names_map,
                headline=_optional_str(args.get("headline")),
                offer_label=_optional_str(args.get("offer_label")),
                cta_text=_optional_str(args.get("cta_text")),
                show_countdown=bool(show_countdown) if show_countdown is not None else None,
                style_notes=_optional_str(args.get("style_notes")),
                force=bool(args.get("force", False)),
            )
            if result.ok:
                _invalidate_menu_cache(ctx)
                commit_agent_mutation(ctx)
            return result

        if tool_name == "disable_promotion":
            promo, resolve_err = _resolve_promotion(promo_service, ctx, args)
            if resolve_err:
                return resolve_err
            assert promo is not None
            promotion_id = promo.id
            display = promotion_display_name(promo)

            try:
                promo_service.delete(ctx.restaurant_id, promotion_id)
            except NotFoundError as exc:
                return ToolResult(ok=False, summary=str(exc) or "Not found")
            _invalidate_menu_cache(ctx)
            commit_agent_mutation(ctx)
            return ToolResult(
                ok=True,
                summary=f"Disabled promotion {display!r}",
                data={"promotion_id": str(promotion_id), "is_active": False},
            )

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
