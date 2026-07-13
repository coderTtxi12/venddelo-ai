"""Map the public live menu (DB) into the ImportDraft OCR schema."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.pagination import PaginationParams
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCatalogDiscount,
    ImportCategory,
    ImportComplementRef,
    ImportDraft,
    ImportOptionGroup,
    ImportOptionItem,
    ImportProduct,
    ImportPromotion,
    PromotionBundle,
    PromotionSchedule,
)
from app.modules.assistant.skills.menu_read.promotions import (
    discount_label,
    is_catalog_discount,
    promotion_display_name,
    schedule_summary,
)
from app.modules.menu.product_status import is_public_menu_listed
from app.modules.menu.schemas import (
    CategoryDTO,
    FullMenuDTO,
    OptionGroupDTO,
    OptionItemDTO,
    ProductDTO,
)
from app.modules.menu.service import MenuService
from app.modules.promotions.option_item_sync import is_nxm_bundle_promo
from app.modules.promotions.schemas import PromotionDTO, enrich_promotion_dto
from app.modules.promotions.service import PromotionService

_PROMOTION_SCAN_LIMIT = 200


class _RefAllocator:
    def __init__(self) -> None:
        self._cat = 0
        self._prod = 0
        self._og = 0
        self._oi = 0
        self._promo = 0
        self.category_uuid_to_ref: dict[uuid.UUID, str] = {}
        self.product_uuid_to_ref: dict[uuid.UUID, str] = {}
        self.option_item_uuid_to_ref: dict[uuid.UUID, str] = {}

    def category(self, category_id: uuid.UUID) -> str:
        ref = self.category_uuid_to_ref.get(category_id)
        if ref is None:
            self._cat += 1
            ref = f"cat_{self._cat}"
            self.category_uuid_to_ref[category_id] = ref
        return ref

    def product(self, product_id: uuid.UUID) -> str:
        ref = self.product_uuid_to_ref.get(product_id)
        if ref is None:
            self._prod += 1
            ref = f"prod_{self._prod}"
            self.product_uuid_to_ref[product_id] = ref
        return ref

    def option_group(self) -> str:
        self._og += 1
        return f"og_{self._og}"

    def option_item(self, item_id: uuid.UUID) -> str:
        ref = self.option_item_uuid_to_ref.get(item_id)
        if ref is None:
            self._oi += 1
            ref = f"oi_{self._oi}"
            self.option_item_uuid_to_ref[item_id] = ref
        return ref

    def promotion(self) -> str:
        self._promo += 1
        return f"promo_{self._promo}"


def _cents_to_mxn(cents: int) -> float:
    return cents / 100


def _sort_option_items(items: list[OptionItemDTO]) -> list[OptionItemDTO]:
    active = [item for item in items if item.is_active]
    inactive = [item for item in items if not item.is_active]
    active.sort(key=lambda item: item.sort_index)
    inactive.sort(key=lambda item: item.sort_index)
    return active + inactive


def _display_option_groups(product: ProductDTO) -> list[tuple[OptionGroupDTO, list[OptionItemDTO]]]:
    groups = [group for group in product.option_groups if group.is_active]
    groups.sort(key=lambda group: group.sort_index)
    rows: list[tuple[OptionGroupDTO, list[OptionItemDTO]]] = []
    for group in groups:
        items = _sort_option_items(group.items)
        if items:
            rows.append((group, items))
    return rows


def _products_for_category(
    products: list[ProductDTO],
    category_id: uuid.UUID,
) -> list[ProductDTO]:
    category_key = str(category_id)
    in_category = [
        product
        for product in products
        if category_id in product.category_ids
    ]

    def sort_key(product: ProductDTO) -> tuple[int, int, str]:
        status_priority = 0 if product.status == "active" else 1
        sort_index = product.category_sort_indices.get(category_key, 1_000_000)
        return (status_priority, sort_index, product.name.casefold())

    return sorted(in_category, key=sort_key)


def _catalog_discount_for_product(
    product_id: uuid.UUID,
    promotions: list[PromotionDTO],
) -> ImportCatalogDiscount | None:
    for promo in promotions:
        if not is_catalog_discount(promo):
            continue
        if product_id not in promo.product_ids:
            continue
        if promo.type == "percent" and promo.percent is not None:
            return ImportCatalogDiscount(
                type="percent",
                percent=float(promo.percent),
                label=discount_label(promo),
            )
        if promo.type == "amount" and promo.amount_cents is not None:
            return ImportCatalogDiscount(
                type="amount",
                amount_mxn=_cents_to_mxn(promo.amount_cents),
                label=discount_label(promo),
            )
    return None


def _map_option_groups(
    product: ProductDTO,
    *,
    refs: _RefAllocator,
) -> list[ImportOptionGroup]:
    groups: list[ImportOptionGroup] = []
    for group, items in _display_option_groups(product):
        mapped_items = [
            ImportOptionItem(
                ref=refs.option_item(item.id),
                label=item.label,
                price_delta_mxn=_cents_to_mxn(item.price_delta_cents),
                sort_order=item.sort_index,
            )
            for item in items
        ]
        selection = "single" if group.selection == "single" else "multi"
        groups.append(
            ImportOptionGroup(
                ref=refs.option_group(),
                title=group.title,
                selection=selection,
                required=group.required,
                min_selections=group.min_selections,
                max_selections=group.max_selections,
                sort_order=group.sort_index,
                items=mapped_items,
            )
        )
    return groups


def _map_product(
    product: ProductDTO,
    *,
    refs: _RefAllocator,
    sort_order: int,
    catalog_promotions: list[PromotionDTO],
) -> ImportProduct:
    return ImportProduct(
        ref=refs.product(product.id),
        name=product.name,
        description=product.description,
        price_mxn=_cents_to_mxn(product.price_cents),
        currency=product.currency or "MXN",
        is_available=product.status == "active",
        sort_order=sort_order,
        option_groups=_map_option_groups(product, refs=refs),
        catalog_discount=_catalog_discount_for_product(product.id, catalog_promotions),
    )


def _map_category(
    category: CategoryDTO,
    *,
    products: list[ProductDTO],
    refs: _RefAllocator,
    catalog_promotions: list[PromotionDTO],
) -> ImportCategory:
    category_products = _products_for_category(products, category.id)
    return ImportCategory(
        ref=refs.category(category.id),
        name=category.name,
        description=category.description,
        sort_order=category.sort_index,
        display_layout=category.display_layout,  # type: ignore[arg-type]
        products=[
            _map_product(
                product,
                refs=refs,
                sort_order=index,
                catalog_promotions=catalog_promotions,
            )
            for index, product in enumerate(category_products)
        ],
    )


def _complement_ref(
    *,
    item_id: uuid.UUID,
    label: str,
    product: ProductDTO,
    group_title: str,
    price_delta_cents: int,
    refs: _RefAllocator,
) -> ImportComplementRef:
    return ImportComplementRef(
        ref=refs.option_item(item_id),
        label=label,
        product_ref=refs.product(product.id),
        product_name=product.name,
        group_title=group_title,
        price_delta_mxn=_cents_to_mxn(price_delta_cents),
    )


def _promotion_type(promo: PromotionDTO) -> str:
    if promo.type == "two_for_one":
        return "two_for_one"
    if promo.type in {"percent", "amount", "combo"}:
        return promo.type
    return promo.type


def _promotion_scope(promo: PromotionDTO) -> str:
    if promo.scope in {"product", "category", "order"}:
        return promo.scope
    return "product"


def _schedule_notes(schedule: dict[str, Any] | None) -> str | None:
    if schedule is None:
        return None
    weekday_names = schedule.get("weekday_names") or []
    start = schedule.get("daily_start_time")
    end = schedule.get("daily_end_time")
    parts: list[str] = []
    if weekday_names:
        parts.append(", ".join(weekday_names))
    if start and end:
        parts.append(f"{start}–{end}")
    elif start:
        parts.append(f"desde {start}")
    elif end:
        parts.append(f"hasta {end}")
    return " · ".join(parts) if parts else None


def _map_promotion(
    promo: PromotionDTO,
    *,
    menu: FullMenuDTO,
    refs: _RefAllocator,
    catalog_promotions: list[PromotionDTO],
) -> ImportPromotion | None:
    if is_catalog_discount(promo):
        return None

    products_by_id = {
        product.id: product
        for product in menu.products
        if is_public_menu_listed(product.status)
    }
    allowed_option_ids = set(promo.option_item_ids)
    participating: list[ImportComplementRef] = []
    excluded: list[ImportComplementRef] = []
    seen_participating: set[uuid.UUID] = set()
    seen_excluded: set[uuid.UUID] = set()

    for product_id in promo.product_ids:
        product = products_by_id.get(product_id)
        if product is None:
            continue
        for group, items in _display_option_groups(product):
            for item in items:
                if item.id in seen_participating or item.id in seen_excluded:
                    continue
                complement = _complement_ref(
                    item_id=item.id,
                    label=item.label,
                    product=product,
                    group_title=group.title,
                    price_delta_cents=item.price_delta_cents,
                    refs=refs,
                )
                if item.id in allowed_option_ids:
                    participating.append(complement)
                    seen_participating.add(item.id)
                elif is_nxm_bundle_promo(promo):
                    excluded.append(complement)
                    seen_excluded.add(item.id)

    schedule = schedule_summary(promo)
    schedule_model = None
    if promo.recurrence_weekdays or promo.recurrence_start_time or promo.recurrence_end_time:
        schedule_model = PromotionSchedule(
            weekdays=list(promo.recurrence_weekdays or []),
            use_time_window=bool(promo.recurrence_start_time or promo.recurrence_end_time),
        )

    bundle = None
    if promo.type == "two_for_one":
        bundle = PromotionBundle(
            get_quantity=promo.bundle_get_quantity or 2,
            pay_quantity=promo.bundle_pay_quantity or 1,
            pairing_mode=promo.bundle_pairing_mode or "cross_product",
        )

    return ImportPromotion(
        ref=refs.promotion(),
        name=promotion_display_name(promo),
        type=_promotion_type(promo),  # type: ignore[arg-type]
        scope=_promotion_scope(promo),  # type: ignore[arg-type]
        percent=float(promo.percent) if promo.percent is not None else None,
        amount_mxn=_cents_to_mxn(promo.amount_cents)
        if promo.amount_cents is not None
        else None,
        bundle=bundle,
        target_product_refs=[refs.product(product_id) for product_id in promo.product_ids],
        target_category_refs=[refs.category(category_id) for category_id in promo.category_ids],
        eligible_option_item_refs=[
            refs.option_item(item_id) for item_id in promo.option_item_ids
        ],
        schedule_notes=_schedule_notes(schedule),
        schedule=schedule_model,
        label=discount_label(promo),
        participating_complements=participating,
        excluded_complements=excluded if is_nxm_bundle_promo(promo) else [],
    )


def build_import_draft_from_live_menu(
    menu: FullMenuDTO,
    *,
    promotions: list[PromotionDTO] | None = None,
) -> ImportDraft:
    """Build ImportDraft from the same entities the public menu renders."""
    promo_list = [enrich_promotion_dto(promo) for promo in (promotions or [])]
    catalog_promotions = [promo for promo in promo_list if is_catalog_discount(promo)]
    public_promotions = [promo for promo in promo_list if not is_catalog_discount(promo)]
    visible_products = [
        product for product in menu.products if is_public_menu_listed(product.status)
    ]

    refs = _RefAllocator()
    categories = sorted(menu.categories, key=lambda category: (category.sort_index, category.name))
    mapped_categories = [
        _map_category(
            category,
            products=visible_products,
            refs=refs,
            catalog_promotions=catalog_promotions,
        )
        for category in categories
    ]

    # Ensure product/category refs exist before mapping promotion targets.
    for category in categories:
        refs.category(category.id)
    for product in visible_products:
        refs.product(product.id)
        for group in product.option_groups:
            if not group.is_active:
                continue
            for item in group.items:
                refs.option_item(item.id)

    mapped_promotions: list[ImportPromotion] = []
    for promo in public_promotions:
        mapped = _map_promotion(
            promo,
            menu=menu,
            refs=refs,
            catalog_promotions=catalog_promotions,
        )
        if mapped is not None:
            mapped_promotions.append(mapped)

    return ImportDraft(
        categories=mapped_categories,
        promotions=mapped_promotions,
        global_rules=[],
        unmapped_text=[],
        open_questions=[],
    )


def capture_live_menu_import_draft(ctx: AgentContext) -> dict[str, Any]:
    """Load public menu + promotions and persistable snapshot envelope."""
    menu = MenuService(ctx.uow.menu).get_full_menu(ctx.restaurant_id)
    restaurant = ctx.uow.restaurants.get(ctx.restaurant_id)
    timezone = getattr(restaurant, "timezone", None) or "America/Mexico_City"
    promo_service = PromotionService(ctx.uow.promotions)
    promotions = promo_service.list_effective_public(
        ctx.restaurant_id,
        PaginationParams(limit=_PROMOTION_SCAN_LIMIT),
        timezone=timezone,
    )
    draft = build_import_draft_from_live_menu(menu, promotions=promotions)
    return {
        "captured_at": datetime.now(UTC).isoformat(),
        "source": "live_menu",
        "import_draft": draft.model_dump(),
    }
