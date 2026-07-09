"""Derive snapshot-aligned fields on import drafts (NxM complement lists, labels)."""

from __future__ import annotations

from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportComplementRef,
    ImportDraft,
    ImportProduct,
    ImportPromotion,
)


def _option_item_index(draft: ImportDraft) -> dict[str, ImportComplementRef]:
    index: dict[str, ImportComplementRef] = {}
    for category in draft.categories:
        for product in category.products:
            for group in product.option_groups:
                for item in group.items:
                    index[item.ref] = ImportComplementRef(
                        ref=item.ref,
                        label=item.label,
                        product_ref=product.ref,
                        product_name=product.name,
                        group_title=group.title,
                        price_delta_mxn=item.price_delta_mxn,
                    )
    return index


def _complements_for_product_refs(
    draft: ImportDraft,
    product_refs: set[str],
    *,
    index: dict[str, ImportComplementRef],
) -> list[ImportComplementRef]:
    rows = [
        complement
        for complement in index.values()
        if complement.product_ref in product_refs
    ]
    rows.sort(key=lambda row: (row.product_name, row.group_title, row.label))
    return rows


def _nxm_label(promo: ImportPromotion) -> str:
    if promo.bundle is not None:
        return f"{promo.bundle.get_quantity}×{promo.bundle.pay_quantity}"
    return "2×1"


def _catalog_discount_label(discount) -> str:
    if discount.type == "percent" and discount.percent is not None:
        return f"-{discount.percent:g}%"
    if discount.type == "amount" and discount.amount_mxn is not None:
        return f"-${discount.amount_mxn:,.2f}".rstrip("0").rstrip(".")
    return discount.label or "descuento"


def _enrich_product(product: ImportProduct) -> ImportProduct:
    if product.catalog_discount is None:
        return product
    discount = product.catalog_discount
    label = discount.label or _catalog_discount_label(discount)
    if discount.label == label:
        return product
    return product.model_copy(
        update={
            "catalog_discount": discount.model_copy(update={"label": label}),
        }
    )


def _enrich_promotion(
    promo: ImportPromotion,
    *,
    index: dict[str, ImportComplementRef],
    draft: ImportDraft,
) -> ImportPromotion:
    if promo.type != "two_for_one":
        return promo

    target_refs = set(promo.target_product_refs)
    allowed_refs = set(promo.eligible_option_item_refs)
    all_complements = _complements_for_product_refs(draft, target_refs, index=index)
    participating = [index[ref] for ref in promo.eligible_option_item_refs if ref in index]
    excluded = [row for row in all_complements if row.ref not in allowed_refs]
    label = promo.label or _nxm_label(promo)

    return promo.model_copy(
        update={
            "label": label,
            "participating_complements": participating,
            "excluded_complements": excluded,
        }
    )


def enrich_import_draft(draft: ImportDraft) -> ImportDraft:
    """Fill derived fields so draft batches mirror live_menu_snapshot semantics."""
    index = _option_item_index(draft)
    categories = [
        category.model_copy(
            update={
                "products": [_enrich_product(product) for product in category.products],
            }
        )
        for category in draft.categories
    ]
    promotions = [_enrich_promotion(promo, index=index, draft=draft) for promo in draft.promotions]
    return draft.model_copy(update={"categories": categories, "promotions": promotions})
