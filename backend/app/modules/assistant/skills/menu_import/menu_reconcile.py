"""Reconcile an import draft against the restaurant's current live menu.

The concierge import investigates the existing menu first, then decides for each
category/product whether to **reuse/update** an existing record (matched by name)
or **create** a new one — so re-importing never duplicates the menu.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass, field

from app.modules.assistant.skills.menu_import.draft_schema import ImportDraft
from app.modules.menu.schemas import FullMenuDTO


def normalize_name(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_name).strip().casefold()


@dataclass(frozen=True, slots=True)
class ReconciliationPlan:
    category_matches: dict[str, str] = field(default_factory=dict)
    product_matches: dict[str, str] = field(default_factory=dict)
    products_with_existing_groups: frozenset[str] = field(default_factory=frozenset)
    new_categories: int = 0
    reused_categories: int = 0
    new_products: int = 0
    updated_products: int = 0
    markdown: str = ""

    def category_id_for(self, ref: str) -> uuid.UUID | None:
        value = self.category_matches.get(ref)
        return uuid.UUID(value) if value else None

    def product_id_for(self, ref: str) -> uuid.UUID | None:
        value = self.product_matches.get(ref)
        return uuid.UUID(value) if value else None


def build_reconciliation_plan(draft: ImportDraft, current: FullMenuDTO) -> ReconciliationPlan:
    """Match draft categories/products to existing ones by normalized name."""
    existing_categories = {normalize_name(c.name): c for c in current.categories}
    existing_products = {normalize_name(p.name): p for p in current.products}

    category_matches: dict[str, str] = {}
    product_matches: dict[str, str] = {}
    with_groups: set[str] = set()
    new_categories = reused_categories = new_products = updated_products = 0

    lines: list[str] = ["## Plan de importación", ""]
    for category in draft.categories:
        existing_cat = existing_categories.get(normalize_name(category.name))
        if existing_cat is not None:
            category_matches[category.ref] = str(existing_cat.id)
            reused_categories += 1
            lines.append(f"↺ **{category.name}** — categoría existente (se actualiza)")
        else:
            new_categories += 1
            lines.append(f"➕ **{category.name}** — categoría nueva")

        for product in category.products:
            existing_prod = existing_products.get(normalize_name(product.name))
            if existing_prod is not None:
                product_matches[product.ref] = str(existing_prod.id)
                updated_products += 1
                if existing_prod.option_groups:
                    with_groups.add(product.ref)
                lines.append(f"  - ↺ {product.name} (actualizar)")
            else:
                new_products += 1
                lines.append(f"  - ➕ {product.name} (nuevo)")
        lines.append("")

    lines.append(
        f"**Resumen:** {new_categories} categoría(s) nueva(s), "
        f"{reused_categories} reutilizada(s) · "
        f"{new_products} producto(s) nuevo(s), {updated_products} actualizado(s)."
    )
    if with_groups:
        lines.append(
            "_Los complementos de productos que ya tienen grupos se respetan (no se duplican)._"
        )

    return ReconciliationPlan(
        category_matches=category_matches,
        product_matches=product_matches,
        products_with_existing_groups=frozenset(with_groups),
        new_categories=new_categories,
        reused_categories=reused_categories,
        new_products=new_products,
        updated_products=updated_products,
        markdown="\n".join(lines),
    )


def reconciliation_plan_to_dict(plan: ReconciliationPlan) -> dict[str, object]:
    return {
        "category_matches": dict(plan.category_matches),
        "product_matches": dict(plan.product_matches),
        "products_with_existing_groups": sorted(plan.products_with_existing_groups),
        "new_categories": plan.new_categories,
        "reused_categories": plan.reused_categories,
        "new_products": plan.new_products,
        "updated_products": plan.updated_products,
        "markdown": plan.markdown,
    }


def reconciliation_plan_from_dict(payload: dict[str, object]) -> ReconciliationPlan | None:
    if not payload:
        return None
    with_groups_raw = payload.get("products_with_existing_groups")
    with_groups: frozenset[str] = frozenset()
    if isinstance(with_groups_raw, list):
        with_groups = frozenset(str(item) for item in with_groups_raw)
    category_matches = payload.get("category_matches")
    product_matches = payload.get("product_matches")
    if not isinstance(category_matches, dict) or not isinstance(product_matches, dict):
        return None
    return ReconciliationPlan(
        category_matches={str(k): str(v) for k, v in category_matches.items()},
        product_matches={str(k): str(v) for k, v in product_matches.items()},
        products_with_existing_groups=with_groups,
        new_categories=int(payload.get("new_categories") or 0),
        reused_categories=int(payload.get("reused_categories") or 0),
        new_products=int(payload.get("new_products") or 0),
        updated_products=int(payload.get("updated_products") or 0),
        markdown=str(payload.get("markdown") or ""),
    )
