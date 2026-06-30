"""Shared product name resolution for menu_read and menu_write skills."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from app.core.pagination import PaginationParams
from app.modules.assistant.skills.menu_read.search import (
    STRONG_MATCH_THRESHOLD,
    SUGGESTION_THRESHOLD,
    match_score,
    normalize_text,
)
from app.modules.menu.schemas import ProductDTO
from app.modules.menu.service import MenuService

# Owner confirmations often prefix the product name — strip before matching.
_QUERY_PREFIXES = (
    "este ",
    "esta ",
    "ese ",
    "esa ",
    "el producto ",
    "la producto ",
    "producto ",
    "si ",
    "sí ",
    "yes ",
)

# When multiple strong fuzzy matches are this close, require disambiguation.
_AMBIGUITY_SCORE_GAP = 0.12

ResolveStatus = Literal["found", "ambiguous", "not_found"]


@dataclass(frozen=True, slots=True)
class ProductResolveResult:
    status: ResolveStatus
    product: ProductDTO | None = None
    matches: tuple[tuple[float, ProductDTO], ...] = ()
    suggestions: tuple[tuple[float, ProductDTO], ...] = ()
    query: str = ""


def normalize_product_query(query: str) -> str:
    """Strip filler prefixes and whitespace from an owner-provided product reference."""
    text = str(query or "").strip()
    normalized = normalize_text(text)
    changed = True
    while changed and normalized:
        changed = False
        for prefix in _QUERY_PREFIXES:
            if normalized.startswith(prefix):
                normalized = normalized[len(prefix) :].strip()
                changed = True
                break
    return normalized


def score_product(query: str, product: ProductDTO) -> float:
    if not product.is_active:
        return 0.0
    normalized_query = normalize_product_query(query)
    if not normalized_query:
        return 0.0
    normalized_name = normalize_text(product.name)
    if normalized_query == normalized_name:
        return 1.0
    return match_score(normalized_query, product.name, product.description or "")


def resolve_product_in_catalog(
    query: str,
    products: list[ProductDTO],
) -> ProductResolveResult:
    """Resolve one product by name within an in-memory catalog slice."""
    cleaned = normalize_product_query(query)
    if not cleaned:
        return ProductResolveResult(status="not_found", query=query)

    exact: list[ProductDTO] = []
    for product in products:
        if not product.is_active:
            continue
        if normalize_text(product.name) == cleaned:
            exact.append(product)

    if len(exact) == 1:
        return ProductResolveResult(
            status="found",
            product=exact[0],
            matches=((1.0, exact[0]),),
            query=query,
        )
    if len(exact) > 1:
        return ProductResolveResult(
            status="ambiguous",
            matches=tuple((1.0, product) for product in exact),
            query=query,
        )

    scored: list[tuple[float, ProductDTO]] = []
    for product in products:
        score = score_product(query, product)
        if score >= SUGGESTION_THRESHOLD:
            scored.append((score, product))
    scored.sort(key=lambda pair: pair[0], reverse=True)

    strong = [pair for pair in scored if pair[0] >= STRONG_MATCH_THRESHOLD]
    if len(strong) == 1:
        return ProductResolveResult(
            status="found",
            product=strong[0][1],
            matches=tuple(strong),
            query=query,
        )
    if len(strong) > 1:
        best_score = strong[0][0]
        tied = [pair for pair in strong if best_score - pair[0] <= _AMBIGUITY_SCORE_GAP]
        if len(tied) == 1:
            return ProductResolveResult(
                status="found",
                product=tied[0][1],
                matches=tuple(strong),
                query=query,
            )
        return ProductResolveResult(
            status="ambiguous",
            matches=tuple(tied),
            query=query,
        )

    return ProductResolveResult(
        status="not_found",
        suggestions=tuple(scored[:5]),
        query=query,
    )


def iter_active_products(
    service: MenuService,
    restaurant_id: uuid.UUID,
    *,
    page_size: int = 100,
) -> list[ProductDTO]:
    """Load all active products for a restaurant (paginated internally)."""
    products: list[ProductDTO] = []
    cursor: str | None = None
    while True:
        page = service.list_products_page(
            restaurant_id,
            PaginationParams(limit=page_size, cursor=cursor),
        )
        products.extend(page.items)
        if not page.has_more:
            break
        cursor = page.next_cursor
    return products


def resolve_product(
    service: MenuService,
    restaurant_id: uuid.UUID,
    query: str,
) -> ProductResolveResult:
    """Resolve a product name against the full tenant catalog."""
    catalog = iter_active_products(service, restaurant_id)
    return resolve_product_in_catalog(query, catalog)
