from __future__ import annotations

from app.modules.assistant.skills.menu_import.batching import count_batch_products
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft


def _format_price_mxn(mxn: float, currency: str = "MXN") -> str:
    return f"${mxn:,.2f} {currency}" if mxn % 1 else f"${mxn:,.0f} {currency}"


def _format_option_group(group) -> str:
    req = "obligatorio" if group.required else "opcional"
    sel = "multi" if group.selection == "multi" else "single"
    max_label = group.max_selections if group.max_selections is not None else "sin límite"
    return f"{group.title} ({req}, {sel}, min={group.min_selections}, max={max_label})"


def _layout_label(layout: str) -> str:
    if layout == "vertical":
        return "list"
    return layout


def build_full_import_preview(draft: ImportDraft) -> str:
    batch = ImportBatch(batch_index=0, categories=draft.categories, promotions=draft.promotions)
    product_count = count_batch_products(batch)
    complement_groups = sum(
        len(product.option_groups) for category in draft.categories for product in category.products
    )
    lines = [
        "## Tu menú digital quedaría así",
        "",
        f"**Productos:** {product_count} · todos activos y publicados",
        f"**Grupos de complementos:** {complement_groups}",
        f"**Promociones:** {len(draft.promotions)}",
        "",
        "### Categorías",
    ]
    for index, category in enumerate(
        sorted(draft.categories, key=lambda c: (c.sort_order, c.name)), start=1
    ):
        layout = _layout_label(category.display_layout or "vertical")
        lines.append(f"{index}. **{category.name}** — layout `{layout}`")
    lines.extend(["", "### Productos", "", "| Categoría | Producto | Precio |", "| --- | --- | --- |"])
    for category in sorted(draft.categories, key=lambda c: (c.sort_order, c.name)):
        for product in sorted(category.products, key=lambda p: (p.sort_order, p.name)):
            price_cell = _format_price_mxn(product.price_mxn, product.currency)
            if product.has_catalog_discount and product.catalog_discount is not None:
                discount = product.catalog_discount
                badge = discount.label or (
                    f"-{discount.percent:g}%"
                    if discount.type == "percent" and discount.percent is not None
                    else f"-{_format_price_mxn(discount.amount_mxn or 0)}"
                )
                price_cell = f"{price_cell} ({badge})"
            lines.append(
                f"| {category.name} | {product.name} | {price_cell} |"
            )
    products_with_complements = [
        (category.name, product)
        for category in draft.categories
        for product in category.products
        if product.option_groups
    ]
    if products_with_complements:
        lines.extend(["", "### Complementos", ""])
        for category_name, product in products_with_complements:
            lines.append(f"**{product.name}** ({category_name})")
            for group in sorted(product.option_groups, key=lambda g: (g.sort_order, g.title)):
                lines.append(f"- {_format_option_group(group)}")
                for item in sorted(group.items, key=lambda i: (i.sort_order, i.label)):
                    extra = (
                        f" (+{_format_price_mxn(item.price_delta_mxn)})"
                        if item.price_delta_mxn
                        else ""
                    )
                    lines.append(f"  - {item.label}{extra}")
            lines.append("")
    if draft.promotions:
        lines.extend(["### Promociones", ""])
        for promo in draft.promotions:
            label = f" · {promo.label}" if promo.label else ""
            lines.append(f"- **{promo.name}** ({promo.type}{label})")
            if promo.is_nxm and promo.participating_complements:
                lines.append(
                    f"  - Complementos participantes: "
                    f"{', '.join(item.label for item in promo.participating_complements)}"
                )
            if promo.is_nxm and promo.excluded_complements:
                lines.append(
                    f"  - Complementos excluidos: "
                    f"{', '.join(item.label for item in promo.excluded_complements)}"
                )
    if draft.open_questions:
        lines.extend(["", "### Pendiente de aclarar", ""])
        for question in draft.open_questions:
            lines.append(f"- [{question.id}] {question.question_es}")
    lines.extend(["", "_Precios en pesos MXN. Al publicar se guardan en centavos._"])
    return "\n".join(lines)
