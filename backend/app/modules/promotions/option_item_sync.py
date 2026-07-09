"""Keep promotion_option_items in sync when promo product targets change."""

from __future__ import annotations

import uuid

from app.core.exceptions import ValidationError
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
    """Add complements for new products and drop complements for removed products."""
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

    for product_id in updated:
        product = menu.get_product(restaurant_id, product_id)
        product_complements = set(active_option_item_ids(product))
        if not product_complements:
            continue
        if product_complements & next_ids:
            continue
        next_ids.update(product_complements)

    return sorted(next_ids)


def add_products_to_nxm_promo(
    menu: MenuService,
    restaurant_id: uuid.UUID,
    *,
    current_product_ids: list[uuid.UUID],
    add_product_ids: list[uuid.UUID],
    current_option_item_ids: list[uuid.UUID],
) -> tuple[list[uuid.UUID], list[uuid.UUID]]:
    """Append products to an NxM promo and add their complements to the allow-list."""
    next_products = sorted(set(current_product_ids) | set(add_product_ids))
    next_options = set(current_option_item_ids)
    existing = set(current_product_ids)
    for product_id in add_product_ids:
        if product_id in existing:
            continue
        product = menu.get_product(restaurant_id, product_id)
        next_options.update(active_option_item_ids(product))
    return next_products, sorted(next_options)


def remove_products_from_nxm_promo(
    menu: MenuService,
    restaurant_id: uuid.UUID,
    *,
    current_product_ids: list[uuid.UUID],
    remove_product_ids: list[uuid.UUID],
    current_option_item_ids: list[uuid.UUID],
) -> tuple[list[uuid.UUID], list[uuid.UUID]]:
    """Remove products from an NxM promo and drop their complements from the allow-list."""
    remove_set = set(remove_product_ids)
    next_products = sorted(pid for pid in current_product_ids if pid not in remove_set)
    if not next_products:
        raise ValidationError("NxM promotion must keep at least one product")

    next_options = set(current_option_item_ids)
    for product_id in remove_set:
        if product_id not in current_product_ids:
            continue
        product = menu.get_product(restaurant_id, product_id)
        for option_id in active_option_item_ids(product):
            next_options.discard(option_id)
    return next_products, sorted(next_options)


def enable_complements_in_nxm_promo(
    menu: MenuService,
    restaurant_id: uuid.UUID,
    *,
    product_ids: list[uuid.UUID],
    current_option_item_ids: list[uuid.UUID],
    enable_option_item_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Re-include complements in an NxM allow-list."""
    all_eligible = set(collect_option_items_for_products(menu, restaurant_id, product_ids))
    to_enable = set(enable_option_item_ids) & all_eligible
    if not to_enable:
        return list(current_option_item_ids)
    return sorted(set(current_option_item_ids) | to_enable)


def disable_complements_in_nxm_promo(
    menu: MenuService,
    restaurant_id: uuid.UUID,
    *,
    product_ids: list[uuid.UUID],
    current_option_item_ids: list[uuid.UUID],
    disable_option_item_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Exclude complements from an NxM allow-list."""
    all_eligible = set(collect_option_items_for_products(menu, restaurant_id, product_ids))
    to_disable = set(disable_option_item_ids) & all_eligible
    if not to_disable:
        return list(current_option_item_ids)
    return sorted(set(current_option_item_ids) - to_disable)
