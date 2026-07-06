"""Keep promotion_option_items in sync when promo product targets change."""

from __future__ import annotations

import uuid

from app.modules.menu.schemas import ProductDTO
from app.modules.menu.service import MenuService
from app.modules.promotions.schemas import PromotionDTO
from app.modules.promotions.types import normalize_promotion_type


def is_nxm_bundle_promo(promo: PromotionDTO) -> bool:
    ptype = normalize_promotion_type(promo.type) or promo.type
    if ptype == "two_for_one":
        return promo.scope in ("product", "category")
    return promo.bundle is not None and promo.scope in ("product", "category")


def active_option_item_ids(product: ProductDTO) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    for group in product.option_groups or []:
        if not group.is_active:
            continue
        for item in group.items:
            if item.is_active:
                ids.append(item.id)
    return ids


def collect_option_items_for_products(
    menu: MenuService,
    restaurant_id: uuid.UUID,
    product_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    collected: set[uuid.UUID] = set()
    for product_id in product_ids:
        product = menu.get_product(restaurant_id, product_id)
        collected.update(active_option_item_ids(product))
    return sorted(collected)


def sync_option_items_for_product_change(
    menu: MenuService,
    restaurant_id: uuid.UUID,
    *,
    previous_product_ids: list[uuid.UUID],
    new_product_ids: list[uuid.UUID],
    current_option_item_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Mirror marketing UI: add complements for new products, drop removed products.

    An empty allow-list means every complement participates; leave it empty.
    """
    if not current_option_item_ids:
        return []

    previous = set(previous_product_ids)
    updated = set(new_product_ids)
    removed = previous - updated
    added = updated - previous

    next_ids = set(current_option_item_ids)
    for product_id in removed:
        product = menu.get_product(restaurant_id, product_id)
        for option_id in active_option_item_ids(product):
            next_ids.discard(option_id)
    for product_id in added:
        product = menu.get_product(restaurant_id, product_id)
        for option_id in active_option_item_ids(product):
            next_ids.add(option_id)

    # Repair products already linked but missing from the allow-list (e.g. added via
    # set_products without complement sync). Only when none of the product's complements
    # participate yet — avoids re-adding complements the owner intentionally excluded.
    for product_id in updated:
        product = menu.get_product(restaurant_id, product_id)
        product_complements = set(active_option_item_ids(product))
        if not product_complements:
            continue
        if product_complements & next_ids:
            continue
        next_ids.update(product_complements)

    return sorted(next_ids)
