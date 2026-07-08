"""Automatic display layout and ordering for menu import (ticket / conversion focused)."""

from __future__ import annotations

from app.modules.assistant.skills.menu_import.complement_heuristics import apply_complement_heuristics
from app.modules.assistant.skills.menu_import.draft_schema import (
    DisplayLayout,
    ImportBatch,
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportOptionItem,
    ImportProduct,
)

_MANY_ITEMS_THRESHOLD = 6

_HORIZONTAL_KEYWORDS = (
    "promo",
    "promoci",
    "combo",
    "destacad",
    "popular",
    "oferta",
    "2x1",
    "2×1",
    "nxm",
    "más pedid",
    "mas pedid",
    "favorit",
)
_GRID_KEYWORDS = (
    "bebida",
    "refresco",
    "postre",
    "dessert",
    "drink",
    "jugo",
    "cerveza",
    "cocktail",
    "café",
    "cafe",
    "helado",
    "shake",
    "smoothie",
)
_EXTRA_KEYWORDS = ("extra", "extras", "agrega", "adicional", "adicionales", "complemento")
_SIZE_KEYWORDS = ("tamaño", "tamano", "size")
_PREMIUM_SIZE_KEYWORDS = ("grande", "large", "xl", "xxl", "familiar", "mega", "doble")

_CATEGORY_ORDER_RULES: tuple[tuple[tuple[str, ...], int], ...] = (
    (("promo", "promoci", "combo", "oferta", "2x1", "2×1", "nxm"), 0),
    (("entrada", "appetizer", "para compartir", "botana", "antojito"), 10),
    (
        (
            "hamburguesa",
            "taco",
            "pizza",
            "plato fuerte",
            "plato",
            "especialidad",
            "fuerte",
            "alitas",
            "boneless",
        ),
        20,
    ),
    (("ensalada", "salad"), 30),
    (("acompañ", "acompan", "guarnicion", "side", "papas"), 40),
    (("postre", "dessert"), 50),
    (("bebida", "refresco", "drink", "jugo", "cerveza", "café", "cafe"), 60),
)


def _normalize(text: str) -> str:
    return text.strip().casefold()


def _category_priority(name: str) -> int:
    normalized = _normalize(name)
    for keywords, priority in _CATEGORY_ORDER_RULES:
        if any(keyword in normalized for keyword in keywords):
            return priority
    return 35


def _choose_display_layout(category: ImportCategory, *, is_new: bool) -> DisplayLayout | None:
    if not is_new:
        return category.display_layout

    count = len(category.products)
    name = _normalize(category.name)

    if count >= 3 and any(keyword in name for keyword in _HORIZONTAL_KEYWORDS):
        return "horizontal"

    if count <= 5 and any(keyword in name for keyword in _GRID_KEYWORDS):
        return "grid"

    if count <= 4:
        return "grid"

    if count >= _MANY_ITEMS_THRESHOLD:
        return "vertical"

    return "vertical"


def _looks_promoted(product: ImportProduct) -> bool:
    name = _normalize(product.name)
    return any(keyword in name for keyword in ("combo", "promo", "2x1", "2×1", "oferta", "especial"))


def _product_sort_key(product: ImportProduct) -> tuple[int, float, str]:
    """Promos first, then premium price anchoring (higher ticket visibility)."""
    return (
        0 if _looks_promoted(product) else 1,
        -product.price_mxn,
        _normalize(product.name),
    )


def _group_sort_key(group: ImportOptionGroup) -> tuple[int, int, str]:
    title = _normalize(group.title)
    if group.required:
        tier = 0
    elif any(keyword in title for keyword in _EXTRA_KEYWORDS):
        tier = 2
    else:
        tier = 1
    return (tier, group.sort_order, title)


def _premium_size_rank(label: str) -> int:
    normalized = _normalize(label)
    if any(keyword in normalized for keyword in _PREMIUM_SIZE_KEYWORDS):
        return 0
    return 1


def _option_item_sort_key(item: ImportOptionItem, group: ImportOptionGroup) -> tuple:
    title = _normalize(group.title)
    if any(keyword in title for keyword in _EXTRA_KEYWORDS):
        return (-item.price_delta_mxn, _normalize(item.label))
    if any(keyword in title for keyword in _SIZE_KEYWORDS):
        return (_premium_size_rank(item.label), -item.price_delta_mxn, _normalize(item.label))
    if group.required:
        return (-item.price_delta_mxn, _normalize(item.label))
    return (item.sort_order, _normalize(item.label))


def _merchandise_option_group(group: ImportOptionGroup) -> ImportOptionGroup:
    sorted_items = sorted(group.items, key=lambda item: _option_item_sort_key(item, group))
    items = [
        item.model_copy(update={"sort_order": index})
        for index, item in enumerate(sorted_items)
    ]
    return group.model_copy(update={"items": items})


def _merchandise_product(product: ImportProduct) -> ImportProduct:
    groups = [_merchandise_option_group(group) for group in product.option_groups]
    groups = sorted(groups, key=_group_sort_key)
    groups = [
        group.model_copy(update={"sort_order": index})
        for index, group in enumerate(groups)
    ]
    return product.model_copy(update={"option_groups": groups})


def _merchandise_category(category: ImportCategory, *, is_new: bool) -> ImportCategory:
    products = [_merchandise_product(product) for product in category.products]
    products = sorted(products, key=_product_sort_key)
    products = [
        product.model_copy(update={"sort_order": index})
        for index, product in enumerate(products)
    ]
    layout = _choose_display_layout(category, is_new=is_new)
    return category.model_copy(
        update={
            "products": products,
            "display_layout": layout,
        }
    )


def apply_import_merchandising(
    batch: ImportBatch,
    *,
    new_category_refs: frozenset[str] | None = None,
) -> ImportBatch:
    """Apply ticket-focused layout and ordering without rewriting menu copy."""
    new_refs = new_category_refs or frozenset()
    categories = [
        _merchandise_category(category, is_new=category.ref in new_refs)
        for category in batch.categories
    ]
    categories = sorted(
        categories,
        key=lambda category: (_category_priority(category.name), _normalize(category.name)),
    )
    categories = [
        category.model_copy(update={"sort_order": index})
        for index, category in enumerate(categories)
    ]
    return batch.model_copy(update={"categories": categories})


def apply_import_merchandising_draft(
    draft: ImportDraft,
    *,
    new_category_refs: frozenset[str] | None = None,
) -> ImportDraft:
    """Merchandise a merged import draft (preview / apply)."""
    with_heuristics = apply_complement_heuristics(draft)
    batch = ImportBatch(
        batch_index=0,
        categories=with_heuristics.categories,
        promotions=with_heuristics.promotions,
        open_questions=with_heuristics.open_questions,
        global_rules=with_heuristics.global_rules,
    )
    merchandised = apply_import_merchandising(batch, new_category_refs=new_category_refs)
    return with_heuristics.model_copy(update={"categories": merchandised.categories})


def new_category_refs(
    categories: list[ImportCategory],
    reconciliation: object | None,
) -> frozenset[str]:
    if reconciliation is None:
        return frozenset(category.ref for category in categories)
    category_id_for = getattr(reconciliation, "category_id_for", None)
    if category_id_for is None:
        return frozenset(category.ref for category in categories)
    return frozenset(
        category.ref
        for category in categories
        if category_id_for(category.ref) is None
    )
