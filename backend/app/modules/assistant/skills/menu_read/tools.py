from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.pagination import PaginationParams
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.assistant.skills.menu_read.promotions import (
    is_catalog_discount,
    promotion_display_name,
    promotion_payload,
)
from app.modules.assistant.skills.menu_read.search import (
    STRONG_MATCH_THRESHOLD,
    SUGGESTION_THRESHOLD,
    match_score,
)
from app.modules.assistant.skills.product_resolve import (
    ProductResolveResult,
    iter_active_products,
    iter_catalog_products,
    normalize_product_query,
    resolve_product,
    resolve_product_in_catalog,
    score_product,
)
from app.modules.menu.schemas import CategoryDTO, OptionGroupDTO, OptionItemDTO, ProductDTO
from app.modules.menu.service import MenuService
from app.modules.promotions.effective import effective_status, is_promotion_effective, resolve_timezone
from app.modules.promotions.schemas import PromotionDTO, enrich_promotion_dto
from app.modules.promotions.service import PromotionService
from app.modules.promotions.types import serialize_promotion_type

DEFAULT_LIST_PRODUCTS_LIMIT = 20
MAX_LIST_PRODUCTS_LIMIT = 50
MAX_SEARCH_RESULTS = 20
MAX_SEARCH_SUGGESTIONS = 5
DEFAULT_LIST_PROMOTIONS_LIMIT = 20
MAX_LIST_PROMOTIONS_LIMIT = 50
PROMOTION_SCAN_LIMIT = 100
LIST_CATEGORIES_LIMIT = 200

DIGITAL_MENU_PROMOTIONS_CATEGORY_ID = "__dm_promotions__"
DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID = "__dm_limited_time__"
DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME = "Promociones"
DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME = "Por tiempo limitado"
SPECIAL_PROMOTIONS_SORT_INDEX = -1000
SPECIAL_LIMITED_TIME_SORT_INDEX = -999


def _list_products_limit(args: dict[str, Any]) -> int:
    raw = args.get("limit", DEFAULT_LIST_PRODUCTS_LIMIT)
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        limit = DEFAULT_LIST_PRODUCTS_LIMIT
    return max(1, min(limit, MAX_LIST_PRODUCTS_LIMIT))


def _list_promotions_limit(args: dict[str, Any]) -> int:
    raw = args.get("limit", DEFAULT_LIST_PROMOTIONS_LIMIT)
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        limit = DEFAULT_LIST_PROMOTIONS_LIMIT
    return max(1, min(limit, MAX_LIST_PROMOTIONS_LIMIT))


def _restaurant_timezone(ctx: AgentContext) -> str:
    restaurant = ctx.uow.restaurants.get(ctx.restaurant_id)
    return getattr(restaurant, "timezone", None) or "America/Mexico_City"


def _promotion_name_maps(
    service: MenuService, restaurant_id: uuid.UUID
) -> tuple[dict[str, str], dict[str, str]]:
    """Build product-id→name and category-id→name maps for resolving promo targets."""
    product_page = service.list_products(
        restaurant_id, PaginationParams(limit=PROMOTION_SCAN_LIMIT)
    )
    product_names = {str(p.id): p.name for p in product_page.items}
    category_page = service.list_categories(
        restaurant_id, PaginationParams(limit=PROMOTION_SCAN_LIMIT)
    )
    category_names = {str(c.id): c.name for c in category_page.items}
    return product_names, category_names


def _promotion_applies_to_product(
    promo: PromotionDTO, product: ProductDTO
) -> str | None:
    """Return how a promo reaches a product ('product'|'category'|'order') or None."""
    product_ids = {str(pid) for pid in promo.product_ids}
    if str(product.id) in product_ids:
        return "product"
    if promo.scope == "category":
        promo_categories = {str(cid) for cid in promo.category_ids}
        product_categories = {str(cid) for cid in product.category_ids}
        if promo_categories & product_categories:
            return "category"
    if promo.scope == "order":
        return "order"
    return None


def _product_option_items(product: ProductDTO) -> list[dict[str, Any]]:
    return [
        {"id": str(item.id), "label": item.label, "group_title": group.title}
        for group in product.option_groups
        if group.is_active
        for item in group.items
        if item.is_active
    ]


def _option_participation(promo: PromotionDTO, product: ProductDTO) -> dict[str, Any] | None:
    """Explain how ``product`` add-ons interact with a promo's ``promotion_option_items``.

    DB source: the ``promotion_option_items`` table (promotion_id ↔ option_item_id),
    surfaced as ``promo.option_item_ids``. For NxM bundles this is an **allow-list**:
    add-ons NOT in it do **not** participate — picking one drops that unit from the 2×1.
    An empty list means every add-on participates. For percent/amount it is a
    **waived** list (those add-ons are free; the rest are charged normally).
    """
    api_type = serialize_promotion_type(promo.type)
    if api_type not in ("bundle", "percent", "amount"):
        return None

    allowed = {str(item_id) for item_id in promo.option_item_ids}
    items = _product_option_items(product)

    if api_type == "bundle":
        if not allowed:
            return {
                "semantics": "bundle_allow_list",
                "mode": "all_participate",
                "note": "Todos los complementos participan en el NxM.",
            }
        participating = [it for it in items if it["id"] in allowed]
        not_participating = [it for it in items if it["id"] not in allowed]
        return {
            "semantics": "bundle_allow_list",
            "mode": "restricted",
            "participating": participating,
            "not_participating": not_participating,
            "note": (
                "Si el cliente elige un complemento de 'not_participating', "
                "esa unidad queda fuera del NxM (paga precio completo)."
            ),
        }

    if not allowed:
        return None
    return {
        "semantics": "waived",
        "free_complements": [it for it in items if it["id"] in allowed],
        "charged_complements": [it for it in items if it["id"] not in allowed],
        "note": "Los complementos de 'free_complements' no se cobran con esta promo.",
    }


def _load_restaurant_promotions(
    promo_service: PromotionService,
    restaurant_id: uuid.UUID,
    *,
    timezone: str,
) -> list[PromotionDTO]:
    page = promo_service.list_for_admin(
        restaurant_id,
        PaginationParams(limit=PROMOTION_SCAN_LIMIT),
        timezone=timezone,
    )
    return list(page.items)


def _promotions_for_product(
    promo_service: PromotionService,
    product: ProductDTO,
    *,
    timezone: str,
    product_names: dict[str, str],
    category_names: dict[str, str],
    effective_only: bool = False,
    all_promotions: list[PromotionDTO] | None = None,
) -> list[dict[str, Any]]:
    """All promotions affecting ``product`` (product/category/order scope), labeled."""
    if all_promotions is None:
        all_promotions = _load_restaurant_promotions(
            promo_service, product.restaurant_id, timezone=timezone
        )
    promotions: list[dict[str, Any]] = []
    for promo in all_promotions:
        applies_via = _promotion_applies_to_product(promo, product)
        if applies_via is None:
            continue
        if effective_only and promo.effective_status != "active":
            continue
        payload = promotion_payload(
            promo,
            product_names=product_names,
            category_names=category_names,
        )
        payload["applies_via"] = applies_via
        participation = _option_participation(promo, product)
        if participation is not None:
            payload["option_participation"] = participation
        promotions.append(payload)
    return promotions


def _score_promotions(
    query: str, promotions: list[PromotionDTO]
) -> list[tuple[float, PromotionDTO]]:
    """Rank promotions by fuzzy similarity of the owner-facing name (best first)."""
    scored: list[tuple[float, PromotionDTO]] = []
    for promo in promotions:
        score = match_score(query, promotion_display_name(promo))
        if score >= SUGGESTION_THRESHOLD:
            scored.append((score, promo))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored


def _score_catalog(
    query: str,
    products: list[ProductDTO],
    *,
    active_only: bool = False,
) -> list[tuple[float, ProductDTO]]:
    """Rank products by fuzzy similarity to ``query`` on **name only** (best first)."""
    cleaned = normalize_product_query(query)
    if not cleaned:
        return []
    resolved = resolve_product_in_catalog(cleaned, products, active_only=active_only)
    if resolved.status == "found" and resolved.product is not None:
        return [(1.0, resolved.product)]
    if resolved.status == "ambiguous":
        return list(resolved.matches)
    if resolved.suggestions:
        return list(resolved.suggestions)
    scored: list[tuple[float, ProductDTO]] = []
    for product in products:
        score = score_product(cleaned, product, active_only=active_only)
        if score >= SUGGESTION_THRESHOLD:
            scored.append((score, product))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored


def _resolve_result_payload(
    resolved: ProductResolveResult,
) -> tuple[bool, str, dict[str, Any]]:
    if resolved.status == "found" and resolved.product is not None:
        return True, resolved.product.name, {}

    if resolved.status == "ambiguous":
        candidates = [
            _scored_payload(score, product) for score, product in resolved.matches[:5]
        ]
        labels = ", ".join(product.name for _, product in resolved.matches[:5])
        return (
            False,
            f"Ambiguous match for {resolved.query!r}; choose one: {labels}",
            {"candidates": candidates, "query": resolved.query, "ambiguous": True},
        )

    suggestions = [
        _scored_payload(score, product) for score, product in resolved.suggestions[:5]
    ]
    if suggestions:
        return (
            False,
            f"No confident match for {resolved.query!r}; see suggestions",
            {"suggestions": suggestions, "query": resolved.query},
        )
    return (
        False,
        (
            f"No product matched {resolved.query!r}. "
            "Fall back to list_products and match by translating the name."
        ),
        {"suggestions": [], "query": resolved.query},
    )


def _scored_payload(score: float, product: ProductDTO) -> dict[str, Any]:
    payload = _product_payload(product)
    payload["match_score"] = round(score, 3)
    return payload


def _selection_summary(group: OptionGroupDTO) -> str:
    """Human-readable picking rule for one option group (mirrors the live menu)."""
    if group.selection == "single":
        return "Elige 1 · Obligatorio" if group.required else "Elige 1 (opcional)"
    low = max(1, group.min_selections) if group.required else group.min_selections
    if group.max_selections is None:
        rule = f"Elige {low} o más" if low else "Elige varios (sin límite)"
    elif low and low == group.max_selections:
        rule = f"Elige exactamente {low}"
    elif low:
        rule = f"Elige entre {low} y {group.max_selections}"
    else:
        rule = f"Elige hasta {group.max_selections}"
    return f"{rule} · Obligatorio" if group.required else f"{rule} (opcional)"


def _option_item_payload(item: OptionItemDTO) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "label": item.label,
        "price_delta_cents": item.price_delta_cents,
        "sort_index": item.sort_index,
        "is_active": item.is_active,
    }


def _option_group_payload(group: OptionGroupDTO) -> dict[str, Any]:
    items = sorted(group.items, key=lambda item: item.sort_index)
    return {
        "id": str(group.id),
        "title": group.title,
        "required": group.required,
        "selection": group.selection,
        "min_selections": group.min_selections,
        "max_selections": group.max_selections,
        "sort_index": group.sort_index,
        "is_active": group.is_active,
        "selection_summary": _selection_summary(group),
        "items": [_option_item_payload(item) for item in items],
    }


def _category_payload(category: CategoryDTO) -> dict[str, Any]:
    return {
        "id": str(category.id),
        "name": category.name,
        "description": category.description,
        "image_path": category.image_path,
        "sort_index": category.sort_index,
        "display_layout": category.display_layout,
        "is_active": category.is_active,
    }


def _regular_category_payload(category: CategoryDTO) -> dict[str, Any]:
    return {
        **_category_payload(category),
        "category_type": "regular",
        "config_enabled": None,
        "visible_in_digital_menu": category.is_active,
        "auto_activates": False,
        "stored_in": "categories",
    }


def _is_promotion_shortcut_candidate(promo: PromotionDTO) -> bool:
    if is_catalog_discount(promo):
        return False
    if promo.scope == "order":
        return False
    return bool((promo.image_path or "").strip())


def _products_participating_in_promotion(
    products: list[ProductDTO], promo: PromotionDTO
) -> list[ProductDTO]:
    if promo.scope == "product":
        product_ids = {str(pid) for pid in promo.product_ids}
        return [product for product in products if str(product.id) in product_ids]
    if promo.scope == "category":
        category_ids = {str(cid) for cid in promo.category_ids}
        explicit_product_ids = {str(pid) for pid in promo.product_ids}
        matched: list[ProductDTO] = []
        for product in products:
            in_category = any(str(cid) in category_ids for cid in product.category_ids)
            if not in_category:
                continue
            if promo.product_ids and str(product.id) not in explicit_product_ids:
                continue
            matched.append(product)
        return matched
    return []


def _list_promotion_shortcuts(
    promotions: list[PromotionDTO],
    products: list[ProductDTO],
    *,
    now: datetime,
    timezone: str,
) -> list[PromotionDTO]:
    tz = resolve_timezone(timezone)
    shortcuts: list[PromotionDTO] = []
    for promo in promotions:
        if not _is_promotion_shortcut_candidate(promo):
            continue
        if not is_promotion_effective(promo, now, tz):
            continue
        if not _products_participating_in_promotion(products, promo):
            continue
        shortcuts.append(promo)
    shortcuts.sort(key=lambda promo: promo.name.casefold())
    return shortcuts


def _product_has_active_menu_offer(
    product: ProductDTO,
    promotions: list[PromotionDTO],
    *,
    now: datetime,
    timezone: str,
) -> bool:
    tz = resolve_timezone(timezone)
    for promo in promotions:
        if not is_promotion_effective(promo, now, tz):
            continue
        if _promotion_applies_to_product(promo, product) is None:
            continue
        api_type = serialize_promotion_type(promo.type)
        if api_type in ("bundle", "combo", "percent", "amount"):
            return True
    return False


def _has_limited_time_products(
    products: list[ProductDTO],
    promotions: list[PromotionDTO],
    *,
    now: datetime,
    timezone: str,
) -> bool:
    return any(
        _product_has_active_menu_offer(product, promotions, now=now, timezone=timezone)
        for product in products
    )


def _special_category_payload(
    *,
    virtual_id: str,
    name: str,
    category_type: str,
    sort_index: int,
    menu_order: int,
    config_enabled: bool,
    visible_in_digital_menu: bool,
    activation_rule: str,
) -> dict[str, Any]:
    return {
        "id": virtual_id,
        "name": name,
        "description": activation_rule,
        "image_path": None,
        "sort_index": sort_index,
        "display_layout": "horizontal",
        "is_active": config_enabled,
        "category_type": category_type,
        "config_enabled": config_enabled,
        "visible_in_digital_menu": visible_in_digital_menu,
        "auto_activates": True,
        "menu_order": menu_order,
        "stored_in": "restaurants",
    }


def _build_special_categories(
    restaurant: Any,
    *,
    has_promotion_shortcuts: bool,
    has_limited_time_products: bool,
) -> list[dict[str, Any]]:
    promotions_enabled = bool(restaurant.digital_menu_promotions_category_enabled)
    promotions_name = (
        (restaurant.digital_menu_promotions_category_name or "").strip()
        or DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME
    )
    limited_enabled = bool(restaurant.digital_menu_limited_time_category_enabled)
    limited_name = (
        (restaurant.digital_menu_limited_time_category_name or "").strip()
        or DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME
    )

    return [
        _special_category_payload(
            virtual_id=DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
            name=promotions_name,
            category_type="special_promotions",
            sort_index=SPECIAL_PROMOTIONS_SORT_INDEX,
            menu_order=1,
            config_enabled=promotions_enabled,
            visible_in_digital_menu=promotions_enabled and has_promotion_shortcuts,
            activation_rule=(
                "Virtual promotions aisle (not in categories table). Appears first on the "
                "digital menu when enabled and at least one live marketing promotion has a "
                "banner image_path with linked products."
            ),
        ),
        _special_category_payload(
            virtual_id=DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
            name=limited_name,
            category_type="special_limited_time",
            sort_index=SPECIAL_LIMITED_TIME_SORT_INDEX,
            menu_order=2,
            config_enabled=limited_enabled,
            visible_in_digital_menu=limited_enabled and has_limited_time_products,
            activation_rule=(
                "Virtual limited-time aisle (not in categories table). Appears second, "
                "right after promotions, when enabled and at least one product has an "
                "active promotion (2×1, percent, amount, combo)."
            ),
        ),
    ]


def _list_categories_result(service: MenuService, ctx: AgentContext) -> ToolResult:
    restaurant = ctx.uow.restaurants.get(ctx.restaurant_id)
    if restaurant is None:
        return ToolResult(ok=False, summary="Restaurant not found")

    page = service.list_all_categories(
        ctx.restaurant_id, PaginationParams(limit=LIST_CATEGORIES_LIMIT)
    )
    regular = [_regular_category_payload(category) for category in page.items]
    regular.sort(key=lambda item: (item["sort_index"], item["name"].casefold()))

    timezone = _restaurant_timezone(ctx)
    now = datetime.now(UTC)
    products = iter_active_products(service, ctx.restaurant_id)
    promo_service = PromotionService(ctx.uow.promotions)
    promo_page = promo_service.list_for_admin(
        ctx.restaurant_id,
        PaginationParams(limit=PROMOTION_SCAN_LIMIT),
        timezone=timezone,
    )
    promotions = list(promo_page.items)

    has_shortcuts = bool(_list_promotion_shortcuts(promotions, products, now=now, timezone=timezone))
    has_limited_time = _has_limited_time_products(
        products, promotions, now=now, timezone=timezone
    )
    specials = _build_special_categories(
        restaurant,
        has_promotion_shortcuts=has_shortcuts,
        has_limited_time_products=has_limited_time,
    )
    categories = specials + regular

    active_regular = sum(1 for item in regular if item["is_active"])
    inactive_regular = len(regular) - active_regular
    visible_specials = sum(1 for item in specials if item["visible_in_digital_menu"])

    return ToolResult(
        ok=True,
        summary=(
            f"Found {len(categories)} categories: 2 special virtual aisles "
            f"({visible_specials} visible now), {active_regular} active regular, "
            f"{inactive_regular} inactive regular"
        ),
        data={
            "categories": categories,
            "special_categories_note": (
                "Promotions and limited-time aisles are virtual: names live on restaurants "
                "(digital_menu_promotions_category_name, digital_menu_limited_time_category_name). "
                "They auto-appear at the top when enabled and their content conditions are met — "
                "promotions first, limited-time second — before regular categories."
            ),
            "counts": {
                "special_total": len(specials),
                "special_visible_now": visible_specials,
                "regular_active": active_regular,
                "regular_inactive": inactive_regular,
            },
        },
    )


def _product_payload(product: ProductDTO) -> dict[str, Any]:
    groups = sorted(product.option_groups, key=lambda group: group.sort_index)
    return {
        "id": str(product.id),
        "name": product.name,
        "description": product.description,
        "image_path": product.image_path,
        "price_cents": product.price_cents,
        "currency": product.currency,
        "is_active": product.is_active,
        "is_published": product.is_published,
        "approval_status": product.approval_status,
        "category_ids": [str(item) for item in product.category_ids],
        "category_sort_indices": dict(product.category_sort_indices),
        "has_options": bool(groups),
        "option_groups": [_option_group_payload(group) for group in groups],
    }


_PRODUCT_PROMOTIONS_DOC = (
    "promotions[] (product/category/order scope: id, name, type, scope, schedule, "
    "effective_status, pricing_note, applies_via, option_participation when relevant — "
    "for bundle NxM: participating[] vs not_participating[] from promotion_option_items; "
    "empty allow-list = all complements participate; for percent/amount: free_complements[] "
    "vs charged_complements[]), has_promotions"
)


def _product_payload_with_promotions(
    product: ProductDTO,
    *,
    promo_service: PromotionService,
    timezone: str,
    product_names: dict[str, str],
    category_names: dict[str, str],
    all_promotions: list[PromotionDTO] | None = None,
    effective_only: bool = False,
    match_score: float | None = None,
) -> dict[str, Any]:
    payload = _product_payload(product)
    if match_score is not None:
        payload["match_score"] = round(match_score, 3)
    promotions = _promotions_for_product(
        promo_service,
        product,
        timezone=timezone,
        product_names=product_names,
        category_names=category_names,
        effective_only=effective_only,
        all_promotions=all_promotions,
    )
    payload["promotions"] = promotions
    payload["has_promotions"] = bool(promotions)
    return payload


class MenuReadSkill:
    id = "menu_read"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="list_categories",
                description=(
                    "List all menu categories for the digital menu: two virtual special aisles "
                    "plus regular categories (active and inactive). Order in the response matches "
                    "display order — promotions special aisle first, limited-time second, then "
                    "regular categories by sort_index. Special aisles auto-appear when enabled and "
                    "their content exists (not stored in categories table; names live on "
                    "restaurants.digital_menu_*). Returns categories[] entries with: id, name, "
                    "description, image_path, sort_index, display_layout, is_active "
                    "(false = disabled regular category or special aisle toggled off), "
                    "category_type (special_promotions | special_limited_time | regular), "
                    "config_enabled, visible_in_digital_menu, auto_activates, menu_order "
                    "(specials only), stored_in."
                ),
                effect="read",
                input_schema={"type": "object", "properties": {}},
            ),
            ToolDefinition(
                name="list_products",
                description=(
                    "List products with cursor pagination. "
                    "Omit category_id for all categories; set category_id to a regular category "
                    "UUID from list_categories (not virtual special aisle ids). Returns products[] "
                    "with: id, name, description, image_path (null if no photo), price_cents "
                    "(always cents — 100 MXN = 10000), currency, is_active, is_published, "
                    "approval_status, category_ids (UUIDs this product belongs to), "
                    "category_sort_indices (order within each category), has_options, "
                    "option_groups[] (complements/add-ons: id, title, required, selection "
                    "single|multi, min_selections, max_selections, sort_index, is_active, "
                    "selection_summary, items[] with id, label, price_delta_cents, sort_index, "
                    "is_active). Also returns "
                    f"{_PRODUCT_PROMOTIONS_DOC}, next_cursor, has_more, limit, and category_id "
                    "when filtered. Paginate until has_more=false for a full catalog audit. "
                    "Live-menu visibility (owner UI: En menú / Draft / Inactivo): "
                    "is_published=true + approval_status=approved → listed on the public menu; "
                    "is_active=true in that state → En menú (orderable); "
                    "is_active=false + is_published=true + approval_status=approved → Inactivo "
                    "(still visible on the live menu but shown as No disponible — not orderable); "
                    "is_published=false or approval_status=draft → Draft (hidden from the live "
                    "menu entirely — customers never see it)."
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
                description=(
                    "Search products by **name** (exact name wins over fuzzy neighbors; "
                    "descriptions are ignored so shared words like 'hamburguesa' in another "
                    "product's copy do not hijack the match). Includes inactive products by "
                    "default — check is_active on each hit. Set active_only=true to limit to "
                    "En menú items only."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "active_only": {
                            "type": "boolean",
                            "description": "When true, ignore inactive products.",
                            "default": False,
                        },
                    },
                    "required": ["query"],
                },
            ),
            ToolDefinition(
                name="get_product",
                description=(
                    "Get one product's full detail. Provide product_id (UUID) when known, "
                    "or name to resolve it by fuzzy match. Provide at least one. Returns "
                    "product with: id, name, description, image_path, price_cents (cents), "
                    "currency, is_active, is_published, approval_status, category_ids, "
                    "category_sort_indices, has_options, option_groups[] (full complement "
                    f"detail), {_PRODUCT_PROMOTIONS_DOC}. Live-menu visibility: "
                    "is_published=true + approval_status=approved → on public menu; "
                    "is_active=true → En menú (orderable); is_active=false + published → "
                    "Inactivo (visible as No disponible); draft/unpublished → hidden from live menu."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {
                            "type": "string",
                            "description": "Product UUID (preferred when known).",
                        },
                        "name": {
                            "type": "string",
                            "description": "Product name to resolve by fuzzy match when no UUID.",
                        },
                    },
                },
            ),
            ToolDefinition(
                name="list_promotions",
                description=(
                    "List the restaurant's promotions (2×1/NxM, percent, amount, combo). "
                    "Each item includes a label, scope targets, schedule, effective_status "
                    "and a pricing_note. Use filters to narrow the view."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "effective_only": {
                            "type": "boolean",
                            "description": "Only promotions active right now (default false).",
                        },
                        "type": {
                            "type": "string",
                            "description": "Filter by type: bundle, percent, amount or combo.",
                        },
                        "scope": {
                            "type": "string",
                            "description": "Filter by scope: product, category or order.",
                        },
                        "include_catalog": {
                            "type": "boolean",
                            "description": (
                                "Include auto product-editor discounts (default false; "
                                "these are usually noise in a promotions overview)."
                            ),
                        },
                        "cursor": {
                            "type": "string",
                            "description": "Cursor from a previous list_promotions call.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": (
                                f"Page size (default {DEFAULT_LIST_PROMOTIONS_LIMIT}, "
                                f"max {MAX_LIST_PROMOTIONS_LIMIT})."
                            ),
                        },
                    },
                },
            ),
            ToolDefinition(
                name="list_product_promotions",
                description=(
                    "List every promotion affecting ONE product: product discounts "
                    "(percent/amount), 2×1/NxM bundles, and order-level promos. A product "
                    "can have several at once. Provide product_id (UUID) or name."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {
                            "type": "string",
                            "description": "Product UUID (preferred when known).",
                        },
                        "name": {
                            "type": "string",
                            "description": "Product name to resolve by fuzzy match when no UUID.",
                        },
                        "effective_only": {
                            "type": "boolean",
                            "description": "Only promotions active right now (default false).",
                        },
                    },
                },
            ),
            ToolDefinition(
                name="get_promotion",
                description=(
                    "Get one promotion's full detail with resolved product/category names "
                    "and a plain-language pricing_note. Provide promotion_id (UUID) or name "
                    "to resolve by fuzzy match."
                ),
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {
                        "promotion_id": {
                            "type": "string",
                            "description": "Promotion UUID (preferred when known).",
                        },
                        "name": {
                            "type": "string",
                            "description": "Promotion name to resolve by fuzzy match when no UUID.",
                        },
                    },
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        service = MenuService(ctx.uow.menu)
        if tool_name == "list_categories":
            return _list_categories_result(service, ctx)

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

            promo_service = PromotionService(ctx.uow.promotions)
            timezone = _restaurant_timezone(ctx)
            product_names, category_names = _promotion_name_maps(service, ctx.restaurant_id)
            all_promotions = _load_restaurant_promotions(
                promo_service, ctx.restaurant_id, timezone=timezone
            )
            products = [
                _product_payload_with_promotions(
                    product,
                    promo_service=promo_service,
                    timezone=timezone,
                    product_names=product_names,
                    category_names=category_names,
                    all_promotions=all_promotions,
                )
                for product in page.items
            ]
            active_count = sum(1 for product in page.items if product.is_active)
            inactive_count = len(page.items) - active_count
            data: dict[str, Any] = {
                "products": products,
                "next_cursor": page.next_cursor,
                "has_more": page.has_more,
                "limit": limit,
                "counts": {
                    "active": active_count,
                    "inactive": inactive_count,
                },
            }
            if category_id is not None:
                data["category_id"] = str(category_id)
            scope = f"category {category_id}" if category_id else "all categories"
            return ToolResult(
                ok=True,
                summary=(
                    f"Listed {len(products)} products ({active_count} active, "
                    f"{inactive_count} inactive, {scope}, has_more={page.has_more})"
                ),
                data=data,
            )

        if tool_name == "search_products":
            query = str(args.get("query", "")).strip()
            active_only = bool(args.get("active_only", False))
            catalog = (
                iter_active_products(service, ctx.restaurant_id)
                if active_only
                else iter_catalog_products(service, ctx.restaurant_id)
            )

            if not query:
                scored = [(1.0, product) for product in catalog if product.is_active or not active_only]
            else:
                scored = _score_catalog(query, catalog, active_only=active_only)

            strong = [
                _scored_payload(score, product)
                for score, product in scored
                if score >= STRONG_MATCH_THRESHOLD
            ][:MAX_SEARCH_RESULTS]
            suggestions = [
                _scored_payload(score, product)
                for score, product in scored
                if score < STRONG_MATCH_THRESHOLD
            ][:MAX_SEARCH_SUGGESTIONS]

            if strong:
                summary = f"Found {len(strong)} matching products"
            elif suggestions:
                summary = (
                    f"No confident match for '{query}'; "
                    f"{len(suggestions)} possible suggestions"
                )
            else:
                summary = (
                    f"No products matched '{query}'. "
                    "Fall back to list_products and match by translating/interpreting the name."
                )
            return ToolResult(
                ok=True,
                summary=summary,
                data={
                    "products": strong,
                    "suggestions": suggestions,
                    "query": query,
                },
            )

        if tool_name == "get_product":
            product_id_raw = args.get("product_id")
            name_raw = args.get("name") or args.get("query")

            def _product_detail(
                product: ProductDTO, *, match_score: float | None = None
            ) -> ToolResult:
                promo_service = PromotionService(ctx.uow.promotions)
                timezone = _restaurant_timezone(ctx)
                product_names, category_names = _promotion_name_maps(
                    service, ctx.restaurant_id
                )
                payload = _product_payload_with_promotions(
                    product,
                    promo_service=promo_service,
                    timezone=timezone,
                    product_names=product_names,
                    category_names=category_names,
                    match_score=match_score,
                )
                promotions = payload["promotions"]
                suffix = f" with {len(promotions)} promotions" if promotions else ""
                return ToolResult(
                    ok=True,
                    summary=f"Found product {product.name}{suffix}",
                    data={"product": payload},
                )

            if product_id_raw:
                try:
                    product_id = uuid.UUID(str(product_id_raw))
                    product = service.get_product_by_id(ctx.restaurant_id, product_id)
                    return _product_detail(product)
                except (ValueError, NotFoundError):
                    # Bad/unknown UUID — fall back to name resolution when available.
                    if not name_raw:
                        return ToolResult(ok=False, summary="Product not found")

            if name_raw:
                query = str(name_raw).strip()
                resolved = resolve_product(service, ctx.restaurant_id, query)
                ok, message, extra = _resolve_result_payload(resolved)
                if not ok:
                    return ToolResult(ok=False, summary=message, data=extra)
                assert resolved.product is not None
                return _product_detail(resolved.product, match_score=1.0)

            return ToolResult(ok=False, summary="Provide product_id or name")

        if tool_name == "list_promotions":
            promo_service = PromotionService(ctx.uow.promotions)
            timezone = _restaurant_timezone(ctx)
            limit = _list_promotions_limit(args)
            cursor_raw = args.get("cursor")
            cursor = str(cursor_raw).strip() if cursor_raw is not None else None
            if cursor == "":
                cursor = None

            page = promo_service.list_for_admin(
                ctx.restaurant_id,
                PaginationParams(limit=limit, cursor=cursor),
                timezone=timezone,
            )

            include_catalog = bool(args.get("include_catalog", True))
            effective_only = bool(args.get("effective_only", False))
            type_filter_raw = args.get("type")
            type_filter = serialize_promotion_type(
                str(type_filter_raw)
            ) if type_filter_raw else None
            scope_filter = str(args.get("scope")).strip() if args.get("scope") else None

            product_names, category_names = _promotion_name_maps(service, ctx.restaurant_id)

            promotions = []
            for promo in page.items:
                if not include_catalog and is_catalog_discount(promo):
                    continue
                if effective_only and promo.effective_status != "active":
                    continue
                if type_filter and serialize_promotion_type(promo.type) != type_filter:
                    continue
                if scope_filter and promo.scope != scope_filter:
                    continue
                promotions.append(
                    promotion_payload(
                        promo,
                        product_names=product_names,
                        category_names=category_names,
                    )
                )

            return ToolResult(
                ok=True,
                summary=(
                    f"Listed {len(promotions)} promotions "
                    f"(has_more={page.has_more})"
                ),
                data={
                    "promotions": promotions,
                    "next_cursor": page.next_cursor,
                    "has_more": page.has_more,
                    "limit": limit,
                },
            )

        if tool_name == "list_product_promotions":
            promo_service = PromotionService(ctx.uow.promotions)
            timezone = _restaurant_timezone(ctx)
            product_id_raw = args.get("product_id")
            name_raw = args.get("name") or args.get("query")
            effective_only = bool(args.get("effective_only", False))

            product: ProductDTO | None = None
            if product_id_raw:
                try:
                    product = service.get_product(
                        ctx.restaurant_id, uuid.UUID(str(product_id_raw))
                    )
                except (ValueError, NotFoundError):
                    product = None

            if product is None and name_raw:
                query = str(name_raw).strip()
                catalog = service.list_products(
                    ctx.restaurant_id, PaginationParams(limit=PROMOTION_SCAN_LIMIT)
                )
                scored = _score_catalog(query, list(catalog.items))
                strong = [pair for pair in scored if pair[0] >= STRONG_MATCH_THRESHOLD]
                if strong:
                    product = strong[0][1]
                else:
                    suggestions = [
                        _scored_payload(score, prod)
                        for score, prod in scored[:MAX_SEARCH_SUGGESTIONS]
                    ]
                    return ToolResult(
                        ok=False,
                        summary=f"No confident product match for '{query}'",
                        data={"suggestions": suggestions, "query": query},
                    )

            if product is None:
                return ToolResult(ok=False, summary="Provide product_id or name")

            product_names, category_names = _promotion_name_maps(service, ctx.restaurant_id)
            promotions = _promotions_for_product(
                promo_service,
                product,
                timezone=timezone,
                product_names=product_names,
                category_names=category_names,
                effective_only=effective_only,
            )

            return ToolResult(
                ok=True,
                summary=(
                    f"Found {len(promotions)} promotions for {product.name}"
                ),
                data={
                    "product": {
                        "id": str(product.id),
                        "name": product.name,
                        "price_cents": product.price_cents,
                        "currency": product.currency,
                    },
                    "promotions": promotions,
                },
            )

        if tool_name == "get_promotion":
            promo_service = PromotionService(ctx.uow.promotions)
            timezone = _restaurant_timezone(ctx)
            promotion_id_raw = args.get("promotion_id")
            name_raw = args.get("name") or args.get("query")
            product_names, category_names = _promotion_name_maps(service, ctx.restaurant_id)

            def _detail(promo: PromotionDTO) -> ToolResult:
                tz = resolve_timezone(timezone)
                promo.effective_status = effective_status(promo, datetime.now(UTC), tz)
                promo = enrich_promotion_dto(promo)
                return ToolResult(
                    ok=True,
                    summary=f"Found promotion {promotion_display_name(promo)}",
                    data={
                        "promotion": promotion_payload(
                            promo,
                            product_names=product_names,
                            category_names=category_names,
                        )
                    },
                )

            if promotion_id_raw:
                try:
                    promotion_id = uuid.UUID(str(promotion_id_raw))
                    promo = promo_service.get(ctx.restaurant_id, promotion_id)
                    return _detail(promo)
                except (ValueError, NotFoundError):
                    if not name_raw:
                        return ToolResult(ok=False, summary="Promotion not found")

            if name_raw:
                query = str(name_raw).strip()
                page = promo_service.list_for_admin(
                    ctx.restaurant_id,
                    PaginationParams(limit=PROMOTION_SCAN_LIMIT),
                    timezone=timezone,
                )
                scored = _score_promotions(query, list(page.items))
                strong = [pair for pair in scored if pair[0] >= STRONG_MATCH_THRESHOLD]
                if strong:
                    return _detail(strong[0][1])
                suggestions = [
                    {
                        "id": str(promo.id),
                        "name": promotion_display_name(promo),
                        "label": promotion_payload(promo)["label"],
                        "match_score": round(score, 3),
                    }
                    for score, promo in scored[:MAX_SEARCH_SUGGESTIONS]
                ]
                if suggestions:
                    return ToolResult(
                        ok=False,
                        summary=f"No confident match for '{query}'; see suggestions",
                        data={"suggestions": suggestions, "query": query},
                    )
                return ToolResult(
                    ok=False,
                    summary=(
                        f"No promotion matched '{query}'. "
                        "Use list_promotions to browse available promotions."
                    ),
                    data={"suggestions": [], "query": query},
                )

            return ToolResult(ok=False, summary="Provide promotion_id or name")

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")
