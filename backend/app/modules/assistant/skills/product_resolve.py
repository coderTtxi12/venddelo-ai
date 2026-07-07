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

ResolveStatus = Literal["found", "ambiguous", "not_found"]


@dataclass(frozen=True, slots=True)
class ProductResolveResult:
    status: ResolveStatus
    product: ProductDTO | None = None
    matches: tuple[tuple[float, ProductDTO], ...] = ()
    suggestions: tuple[tuple[float, ProductDTO], ...] = ()
    query: str = ""


def normalize_product_query(query: str) -> str:
    """Normalize an owner-provided product reference for comparison."""
    return normalize_text(str(query or "").strip())


def score_product(query: str, product: ProductDTO, *, active_only: bool = False) -> float:
    """Score how well ``query`` matches a product **by name** (description ignored)."""
    if active_only and product.status != "active":
        return 0.0
    normalized_query = normalize_product_query(query)
    if not normalized_query:
        return 0.0
    normalized_name = normalize_text(product.name)
    if normalized_query == normalized_name:
        return 1.0
    return match_score(normalized_query, product.name)


def resolve_product_in_catalog(
    query: str,
    products: list[ProductDTO],
    *,
    active_only: bool = False,
) -> ProductResolveResult:
    """Resolve one product by name within an in-memory catalog slice."""
    cleaned = normalize_product_query(query)
    if not cleaned:
        return ProductResolveResult(status="not_found", query=query)

    exact: list[ProductDTO] = []
    for product in products:
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
        score = score_product(query, product, active_only=active_only)
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
        return ProductResolveResult(
            status="ambiguous",
            matches=tuple(strong),
            query=query,
        )

    return ProductResolveResult(
        status="not_found",
        suggestions=tuple(scored[:5]),
        query=query,
    )


def iter_catalog_products(
    service: MenuService,
    restaurant_id: uuid.UUID,
    *,
    page_size: int = 100,
) -> list[ProductDTO]:
    """Load all products for a restaurant (active and inactive)."""
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


def iter_active_products(
    service: MenuService,
    restaurant_id: uuid.UUID,
    *,
    page_size: int = 100,
) -> list[ProductDTO]:
    """Load orderable products only."""
    return [
        product
        for product in iter_catalog_products(service, restaurant_id, page_size=page_size)
        if product.status == "active"
    ]


def resolve_product(
    service: MenuService,
    restaurant_id: uuid.UUID,
    query: str,
    *,
    active_only: bool = False,
) -> ProductResolveResult:
    """Resolve a product name against the tenant catalog (includes inactive by default)."""
    catalog = iter_catalog_products(service, restaurant_id)
    return resolve_product_in_catalog(query, catalog, active_only=active_only)
