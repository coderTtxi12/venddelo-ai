"""Deterministic complement-group rules when menu text signals are clear."""

from __future__ import annotations

from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportProduct,
)

_SIZE_KEYWORDS = ("tamaño", "tamano", "size", "elige tu", "escoge tu")
_SALSA_KEYWORDS = ("salsa", "escoge", "elige")
_EXTRA_KEYWORDS = ("extra", "extras", "agrega", "adicional", "adicionales", "complemento")


def _normalize_title(title: str) -> str:
    return title.strip().casefold()


def _infer_group_rules(group: ImportOptionGroup) -> ImportOptionGroup:
    title = _normalize_title(group.title)
    item_count = len(group.items)

    if any(keyword in title for keyword in _SIZE_KEYWORDS):
        return group.model_copy(
            update={
                "required": True,
                "selection": "single",
                "min_selections": 1,
                "max_selections": 1,
            }
        )

    if any(keyword in title for keyword in _SALSA_KEYWORDS) and "extra" not in title:
        return group.model_copy(
            update={
                "required": True,
                "selection": "single",
                "min_selections": 1,
                "max_selections": 1,
            }
        )

    if any(keyword in title for keyword in _EXTRA_KEYWORDS):
        return group.model_copy(
            update={
                "required": False,
                "selection": "multi",
                "min_selections": 0,
                "max_selections": None,
            }
        )

    if group.required:
        max_sel = group.max_selections if group.max_selections is not None else 1
        return group.model_copy(
            update={
                "selection": "single",
                "min_selections": max(group.min_selections, 1),
                "max_selections": max(max_sel, 1),
            }
        )

    if (
        group.selection == "multi"
        and group.max_selections is not None
        and group.max_selections <= 1
        and item_count > 1
    ):
        return group.model_copy(update={"max_selections": min(item_count, 5)})

    return group


def _apply_to_product(product: ImportProduct) -> ImportProduct:
    inferred = [_infer_group_rules(group) for group in product.option_groups]
    inferred.sort(key=lambda group: (group.sort_order, group.title))
    groups = [
        group.model_copy(update={"sort_order": index})
        for index, group in enumerate(inferred)
    ]
    return product.model_copy(update={"option_groups": groups})


def apply_complement_heuristics(draft: ImportDraft) -> ImportDraft:
    """Apply keyword-based complement rules before or after LLM optimization."""
    categories = [
        category.model_copy(
            update={
                "products": [_apply_to_product(product) for product in category.products],
            }
        )
        for category in draft.categories
    ]
    return draft.model_copy(update={"categories": categories})
