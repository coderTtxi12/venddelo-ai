"""Ensure import-draft entity refs are unique before apply."""

from __future__ import annotations

import re

from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportOptionItem,
    ImportProduct,
    ImportPromotion,
    OpenQuestion,
)

_REF_SUFFIX = re.compile(r"^(?P<prefix>[a-zA-Z]+)_(?P<num>\d+)$")


def _bump_counter(counters: dict[str, int], prefix: str, value: int) -> None:
    counters[prefix] = max(counters.get(prefix, 0), value)


def _allocate_ref(
    preferred: str,
    *,
    prefix: str,
    used: set[str],
    counters: dict[str, int],
) -> str:
    if preferred and preferred not in used:
        used.add(preferred)
        match = _REF_SUFFIX.match(preferred)
        if match and match.group("prefix") == prefix:
            _bump_counter(counters, prefix, int(match.group("num")))
        return preferred

    next_num = counters.get(prefix, 0) + 1
    while f"{prefix}_{next_num}" in used:
        next_num += 1
    counters[prefix] = next_num
    allocated = f"{prefix}_{next_num}"
    used.add(allocated)
    return allocated


def _remap_refs(refs: list[str], mapping: dict[str, str]) -> list[str]:
    remapped: list[str] = []
    for ref in refs:
        remapped.append(mapping.get(ref, ref))
    return remapped


def ensure_unique_import_refs(draft: ImportDraft) -> ImportDraft:
    """Renumber duplicate cat/prod/og/oi/promo refs so apply ref_map stays stable."""
    used: set[str] = set()
    counters: dict[str, int] = {}
    # First-seen preferred ref wins for external pointers (questions / promos).
    first_seen: dict[str, str] = {}

    def bind(preferred: str, prefix: str) -> str:
        allocated = _allocate_ref(
            preferred, prefix=prefix, used=used, counters=counters
        )
        first_seen.setdefault(preferred, allocated)
        return allocated

    categories: list[ImportCategory] = []
    for category in draft.categories:
        products: list[ImportProduct] = []
        for product in category.products:
            groups: list[ImportOptionGroup] = []
            for group in product.option_groups:
                items = [
                    ImportOptionItem(
                        ref=bind(item.ref, "oi"),
                        label=item.label,
                        price_delta_mxn=item.price_delta_mxn,
                        sort_order=item.sort_order,
                    )
                    for item in group.items
                ]
                groups.append(
                    group.model_copy(
                        update={
                            "ref": bind(group.ref, "og"),
                            "items": items,
                        }
                    )
                )
            products.append(
                product.model_copy(
                    update={
                        "ref": bind(product.ref, "prod"),
                        "option_groups": groups,
                    }
                )
            )
        categories.append(
            category.model_copy(
                update={
                    "ref": bind(category.ref, "cat"),
                    "products": products,
                }
            )
        )

    promotions: list[ImportPromotion] = []
    for promo in draft.promotions:
        promotions.append(
            promo.model_copy(
                update={
                    "ref": bind(promo.ref, "promo"),
                    "target_product_refs": _remap_refs(
                        promo.target_product_refs, first_seen
                    ),
                    "target_category_refs": _remap_refs(
                        promo.target_category_refs, first_seen
                    ),
                    "eligible_option_item_refs": _remap_refs(
                        promo.eligible_option_item_refs, first_seen
                    ),
                }
            )
        )

    open_questions: list[OpenQuestion] = []
    for question in draft.open_questions:
        open_questions.append(
            question.model_copy(
                update={"related_refs": _remap_refs(question.related_refs, first_seen)}
            )
        )

    return draft.model_copy(
        update={
            "categories": categories,
            "promotions": promotions,
            "open_questions": open_questions,
        }
    )


def ensure_unique_batch_refs(batch: ImportBatch) -> ImportBatch:
    draft = ensure_unique_import_refs(
        ImportDraft(
            categories=batch.categories,
            promotions=batch.promotions,
            global_rules=batch.global_rules,
            open_questions=batch.open_questions,
        )
    )
    return batch.model_copy(
        update={
            "categories": draft.categories,
            "promotions": draft.promotions,
            "global_rules": draft.global_rules,
            "open_questions": draft.open_questions,
        }
    )
