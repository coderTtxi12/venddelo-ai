from __future__ import annotations

from app.core.config import get_settings
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportCategory,
    ImportDraft,
    ImportProduct,
)


def single_batch_from_draft(draft: ImportDraft) -> ImportBatch:
    """Wrap the entire draft into one batch so the whole menu applies in one shot."""
    return ImportBatch(
        batch_index=0,
        categories=draft.categories,
        promotions=draft.promotions,
        global_rules=draft.global_rules,
        open_questions=draft.open_questions,
    )


def _product_count(categories: list[ImportCategory]) -> int:
    return sum(len(category.products) for category in categories)


def _split_oversized_category(
    category: ImportCategory,
    max_products: int,
) -> list[ImportCategory]:
    chunks: list[ImportCategory] = []
    products = list(category.products)
    while products:
        chunk_products = products[:max_products]
        products = products[max_products:]
        suffix = f"_{len(chunks) + 1}" if len(products) > 0 or chunks else ""
        chunks.append(
            category.model_copy(
                update={
                    "ref": f"{category.ref}{suffix}",
                    "products": chunk_products,
                }
            )
        )
    return chunks


def split_draft_into_batches(
    draft: ImportDraft,
    max_products: int | None = None,
) -> list[ImportBatch]:
    """Split an import draft into batches of at most max_products, preferring whole categories."""
    limit = max_products if max_products is not None else get_settings().menu_import_batch_max_products
    if limit <= 0:
        raise ValueError("max_products must be positive")

    batches: list[ImportBatch] = []
    current_categories: list[ImportCategory] = []
    current_count = 0

    def flush_batch() -> None:
        nonlocal current_categories, current_count
        if not current_categories:
            return
        batch_index = len(batches)
        batches.append(
            ImportBatch(
                batch_index=batch_index,
                categories=current_categories,
                promotions=draft.promotions if batch_index == 0 else [],
                global_rules=draft.global_rules if batch_index == 0 else [],
                open_questions=draft.open_questions if batch_index == 0 else [],
            )
        )
        current_categories = []
        current_count = 0

    expanded_categories: list[ImportCategory] = []
    for category in draft.categories:
        if len(category.products) <= limit:
            expanded_categories.append(category)
        else:
            expanded_categories.extend(_split_oversized_category(category, limit))

    for category in expanded_categories:
        cat_count = len(category.products)
        if cat_count == 0:
            continue

        if cat_count <= limit - current_count:
            current_categories.append(category)
            current_count += cat_count
            continue

        flush_batch()
        if cat_count <= limit:
            current_categories = [category]
            current_count = cat_count
            continue

        # Should not happen after _split_oversized_category, but keep safe.
        for partial in _split_oversized_category(category, limit):
            current_categories = [partial]
            current_count = len(partial.products)
            flush_batch()

    flush_batch()

    if not batches and (
        draft.promotions or draft.global_rules or draft.open_questions
    ):
        batches.append(
            ImportBatch(
                batch_index=0,
                categories=[],
                promotions=draft.promotions,
                global_rules=draft.global_rules,
                open_questions=draft.open_questions,
            )
        )

    return batches


def count_batch_products(batch: ImportBatch) -> int:
    return _product_count(batch.categories)
