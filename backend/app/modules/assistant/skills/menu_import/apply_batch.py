"""Apply an import draft batch to the live menu within a single UoW transaction."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.core.exceptions import ValidationError
from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.context import AgentContext, commit_agent_mutation
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportCategory,
    ImportOptionGroup,
    ImportProduct,
    ImportPromotion,
)
from app.modules.assistant.skills.menu_import.menu_reconcile import ReconciliationPlan
from app.modules.assistant.skills.menu_import.merchandising import (
    apply_import_merchandising,
    new_category_refs,
)
from app.modules.assistant.skills.menu_import.price_units import mxn_to_cents
from app.modules.assistant.skills.menu_import.session_repository import MenuImportSessionRepository
from app.core.config import get_settings
from app.modules.assistant.skills.menu_import.batching import count_batch_products
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryProductOrderUpdate,
    CategoryUpdate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
    ProductUpdate,
)
from app.modules.menu.service import MenuService
from app.modules.promotions.pricing import CATALOG_DISCOUNT_PREFIX
from app.modules.promotions.schemas import PromotionBundle, PromotionCreate, PromotionScheduleInput
from app.modules.promotions.service import PromotionService


@dataclass(frozen=True, slots=True)
class ApplyFullResult:
    ok: bool
    summary: str
    batches_applied: int = 0
    categories: int = 0
    products: int = 0
    option_groups: int = 0
    option_items: int = 0
    promotions: int = 0


@dataclass(frozen=True, slots=True)
class ApplyBatchResult:
    ok: bool
    summary: str
    categories: int = 0
    products: int = 0
    option_groups: int = 0
    option_items: int = 0
    promotions: int = 0
    ref_map: dict[str, str] = field(default_factory=dict)


def _batch_dict_to_model(batch_data: dict[str, Any]) -> ImportBatch:
    return ImportBatch.model_validate(batch_data)


def _unanswered_question_ids(
    batch: ImportBatch,
    clarification_answers: dict[str, Any],
) -> list[str]:
    unanswered: list[str] = []
    for question in batch.open_questions:
        answer = clarification_answers.get(question.id)
        if answer is None or not str(answer).strip():
            unanswered.append(question.id)
    return unanswered


def _accumulated_ref_map(draft_batches: list[Any]) -> dict[str, uuid.UUID]:
    merged: dict[str, uuid.UUID] = {}
    for entry in draft_batches:
        if not isinstance(entry, dict):
            continue
        if not entry.get("applied_at"):
            continue
        raw_map = entry.get("ref_map") or {}
        if not isinstance(raw_map, dict):
            continue
        for ref, value in raw_map.items():
            try:
                merged[str(ref)] = uuid.UUID(str(value))
            except (TypeError, ValueError):
                continue
    return merged


def _resolve_refs(refs: list[str], ref_map: dict[str, uuid.UUID]) -> list[uuid.UUID]:
    resolved: list[uuid.UUID] = []
    for ref in refs:
        target = ref_map.get(ref)
        if target is None:
            raise ValidationError(f"Unknown ref {ref!r} for promotion target")
        resolved.append(target)
    return resolved


def _promotion_placeholder_image(restaurant_id: uuid.UUID) -> str:
    return f"restaurants/{restaurant_id}/import/promo-banner-placeholder.png"


def _build_promotion_create(
    promo: ImportPromotion,
    *,
    restaurant_id: uuid.UUID,
    ref_map: dict[str, uuid.UUID],
) -> PromotionCreate:
    schedule: PromotionScheduleInput | None = None
    if promo.schedule is not None:
        schedule = PromotionScheduleInput(
            weekdays=list(promo.schedule.weekdays),
            use_time_window=promo.schedule.use_time_window,
        )

    bundle: PromotionBundle | None = None
    if promo.bundle is not None:
        bundle = PromotionBundle(
            get_quantity=promo.bundle.get_quantity,
            pay_quantity=promo.bundle.pay_quantity,
            pairing_mode=promo.bundle.pairing_mode,
        )

    return PromotionCreate(
        restaurant_id=restaurant_id,
        name=promo.name,
        image_path=_promotion_placeholder_image(restaurant_id),
        type=promo.type,
        scope=promo.scope,
        percent=int(promo.percent) if promo.percent is not None else None,
        amount_cents=mxn_to_cents(promo.amount_mxn) if promo.amount_mxn is not None else None,
        bundle=bundle,
        schedule=schedule,
        product_ids=_resolve_refs(promo.target_product_refs, ref_map),
        category_ids=_resolve_refs(promo.target_category_refs, ref_map),
        option_item_ids=_resolve_refs(promo.eligible_option_item_refs, ref_map),
    )


def _option_group_max_selections(group: ImportOptionGroup) -> int | None:
    if group.selection == "single":
        return 1
    return group.max_selections


def _apply_catalog_discounts(
    promo_service: PromotionService,
    ctx: AgentContext,
    categories: list[ImportCategory],
    ref_map: dict[str, uuid.UUID],
) -> int:
    count = 0
    for category in categories:
        for product in category.products:
            discount = product.catalog_discount
            if discount is None:
                continue
            product_id = ref_map.get(product.ref)
            if product_id is None:
                continue
            promo_service.create(
                ctx.restaurant_id,
                PromotionCreate(
                    restaurant_id=ctx.restaurant_id,
                    name=f"{CATALOG_DISCOUNT_PREFIX} {product.name}",
                    image_path=_promotion_placeholder_image(ctx.restaurant_id),
                    type=discount.type,
                    scope="product",
                    percent=int(discount.percent) if discount.type == "percent" and discount.percent is not None else None,
                    amount_cents=(
                        mxn_to_cents(discount.amount_mxn)
                        if discount.type == "amount" and discount.amount_mxn is not None
                        else None
                    ),
                    product_ids=[product_id],
                ),
            )
            count += 1
    return count


def _apply_categories(
    menu: MenuService,
    ctx: AgentContext,
    categories: list[ImportCategory],
    ref_map: dict[str, uuid.UUID],
    reconciliation: ReconciliationPlan | None,
) -> int:
    count = 0
    for category in categories:
        layout = (
            category.display_layout
            if category.display_layout in {"vertical", "horizontal", "grid"}
            else None
        )
        existing_id = reconciliation.category_id_for(category.ref) if reconciliation else None
        if existing_id is not None:
            menu.update_category(
                ctx.restaurant_id,
                existing_id,
                CategoryUpdate(
                    description=category.description,
                    sort_index=category.sort_order,
                    display_layout=layout,
                ),
            )
            ref_map[category.ref] = existing_id
        else:
            created = menu.create_category(
                CategoryCreate(
                    restaurant_id=ctx.restaurant_id,
                    name=category.name,
                    description=category.description,
                    sort_index=category.sort_order,
                )
            )
            ref_map[category.ref] = created.id
            if layout is not None:
                menu.update_category(
                    ctx.restaurant_id,
                    created.id,
                    CategoryUpdate(display_layout=layout),
                )
        count += 1
    return count


def _apply_products(
    menu: MenuService,
    ctx: AgentContext,
    categories: list[ImportCategory],
    ref_map: dict[str, uuid.UUID],
    reconciliation: ReconciliationPlan | None,
) -> int:
    count = 0
    for category in categories:
        category_id = ref_map[category.ref]
        sorted_products = sorted(category.products, key=lambda p: (p.sort_order, p.name))
        for product in sorted_products:
            existing_id = reconciliation.product_id_for(product.ref) if reconciliation else None
            if existing_id is not None:
                product_update = ProductUpdate(
                    description=product.description,
                    price_cents=mxn_to_cents(product.price_mxn),
                    status="active" if product.is_available else "inactive",
                )
                menu.update_product(ctx.restaurant_id, existing_id, product_update)
                ref_map[product.ref] = existing_id
            else:
                created = menu.create_product(
                    ctx.restaurant_id,
                    ProductCreate(
                        restaurant_id=ctx.restaurant_id,
                        name=product.name,
                        description=product.description,
                        price_cents=mxn_to_cents(product.price_mxn),
                        currency=product.currency,
                        category_ids=[category_id],
                    ),
                )
                ref_map[product.ref] = created.id
                product_update = ProductUpdate(
                    status="active" if product.is_available else "inactive",
                )
                menu.update_product(ctx.restaurant_id, created.id, product_update)
            count += 1
    return count


def _apply_option_groups(
    menu: MenuService,
    ctx: AgentContext,
    categories: list[ImportCategory],
    ref_map: dict[str, uuid.UUID],
    reconciliation: ReconciliationPlan | None,
) -> tuple[int, int]:
    group_count = 0
    item_count = 0
    skip_refs = (
        reconciliation.products_with_existing_groups if reconciliation else frozenset()
    )
    for category in categories:
        for product in category.products:
            if product.ref in skip_refs:
                continue
            product_id = ref_map[product.ref]
            sorted_groups = sorted(product.option_groups, key=lambda g: (g.sort_order, g.title))
            for group in sorted_groups:
                group_count, item_count = _apply_single_option_group(
                    menu,
                    ctx,
                    product_id,
                    group,
                    ref_map,
                    group_count,
                    item_count,
                )
    return group_count, item_count


def _apply_single_option_group(
    menu: MenuService,
    ctx: AgentContext,
    product_id: uuid.UUID,
    group: ImportOptionGroup,
    ref_map: dict[str, uuid.UUID],
    group_count: int,
    item_count: int,
) -> tuple[int, int]:
    sorted_items = sorted(group.items, key=lambda i: (i.sort_order, i.label))
    items = [
        OptionItemCreate(
            label=item.label,
            price_delta_cents=mxn_to_cents(item.price_delta_mxn),
            sort_index=item.sort_order,
        )
        for item in sorted_items
    ]
    created_group = menu.add_option_group(
        ctx.restaurant_id,
        product_id,
        OptionGroupCreate(
            title=group.title,
            required=group.required,
            selection=group.selection,
            min_selections=group.min_selections,
            max_selections=_option_group_max_selections(group),
            sort_index=group.sort_order,
            items=items,
        ),
    )
    ref_map[group.ref] = created_group.id
    group_count += 1
    for import_item, created_item in zip(sorted_items, created_group.items, strict=True):
        ref_map[import_item.ref] = created_item.id
        item_count += 1
    return group_count, item_count


def _new_category_refs(
    categories: list[ImportCategory],
    reconciliation: ReconciliationPlan | None,
) -> frozenset[str]:
    return new_category_refs(categories, reconciliation)


def _apply_product_order(
    menu: MenuService,
    ctx: AgentContext,
    categories: list[ImportCategory],
    ref_map: dict[str, uuid.UUID],
) -> None:
    for category in categories:
        category_id = ref_map.get(category.ref)
        if category_id is None:
            continue
        ordered_ids: list[uuid.UUID] = []
        for product in sorted(category.products, key=lambda p: (p.sort_order, p.name)):
            product_id = ref_map.get(product.ref)
            if product_id is not None:
                ordered_ids.append(product_id)
        if not ordered_ids:
            continue
        menu.set_category_product_order(
            ctx.restaurant_id,
            category_id,
            CategoryProductOrderUpdate(product_ids=ordered_ids),
        )


def _apply_promotions(
    promo_service: PromotionService,
    ctx: AgentContext,
    promotions: list[ImportPromotion],
    ref_map: dict[str, uuid.UUID],
) -> int:
    count = 0
    for promo in promotions:
        promo_service.create(
            ctx.restaurant_id,
            _build_promotion_create(promo, restaurant_id=ctx.restaurant_id, ref_map=ref_map),
        )
        count += 1
    return count


def apply_import_batch(
    ctx: AgentContext,
    session: MenuImportSession,
    batch_index: int,
    *,
    confirmed: bool,
    reconciliation: ReconciliationPlan | None = None,
) -> ApplyBatchResult:
    if not confirmed:
        return ApplyBatchResult(ok=False, summary="confirmed=true is required to apply a batch")

    draft_batches = list(session.draft_batches or [])
    if batch_index < 0 or batch_index >= len(draft_batches):
        return ApplyBatchResult(ok=False, summary=f"Batch index {batch_index} not found")

    batch_entry = draft_batches[batch_index]
    if not isinstance(batch_entry, dict):
        return ApplyBatchResult(ok=False, summary="Invalid batch payload in session")

    if batch_entry.get("applied_at"):
        return ApplyBatchResult(ok=False, summary=f"Batch {batch_index} was already applied")

    batch = _batch_dict_to_model(batch_entry)
    unanswered = _unanswered_question_ids(batch, session.clarification_answers or {})
    if unanswered:
        return ApplyBatchResult(
            ok=False,
            summary=(
                "Batch has unanswered open_questions; save clarification answers first: "
                + ", ".join(unanswered)
            ),
        )

    batch = apply_import_merchandising(
        batch,
        new_category_refs=_new_category_refs(batch.categories, reconciliation),
    )

    menu = MenuService(ctx.uow.menu)
    promo_service = PromotionService(ctx.uow.promotions)
    ref_map = _accumulated_ref_map(draft_batches)

    try:
        categories_created = _apply_categories(
            menu, ctx, batch.categories, ref_map, reconciliation
        )
        products_created = _apply_products(
            menu, ctx, batch.categories, ref_map, reconciliation
        )
        _apply_product_order(menu, ctx, batch.categories, ref_map)
        groups_created, items_created = _apply_option_groups(
            menu, ctx, batch.categories, ref_map, reconciliation
        )
        promotions_created = _apply_promotions(
            promo_service, ctx, batch.promotions, ref_map
        )
        catalog_discounts_created = _apply_catalog_discounts(
            promo_service, ctx, batch.categories, ref_map
        )
        promotions_created += catalog_discounts_created
    except ValidationError as exc:
        ctx.uow.rollback()
        return ApplyBatchResult(ok=False, summary=str(exc))

    invalidate_restaurant_menu_cache(ctx.uow, ctx.restaurant_id)
    commit_agent_mutation(ctx)

    batch_entry["ref_map"] = {ref: str(value) for ref, value in ref_map.items()}
    batch_entry["applied_at"] = datetime.now(UTC).isoformat()
    draft_batches[batch_index] = batch_entry
    session.draft_batches = draft_batches
    MenuImportSessionRepository(ctx.uow.session).update(session)

    summary = (
        f"Applied batch {batch_index}: "
        f"{categories_created} categories, {products_created} products, "
        f"{groups_created} option groups, {items_created} option items, "
        f"{promotions_created} promotions"
    )
    return ApplyBatchResult(
        ok=True,
        summary=summary,
        categories=categories_created,
        products=products_created,
        option_groups=groups_created,
        option_items=items_created,
        promotions=promotions_created,
        ref_map=batch_entry["ref_map"],
    )


def _count_session_products(session: MenuImportSession) -> int:
    total = 0
    for entry in session.draft_batches or []:
        if isinstance(entry, dict):
            total += count_batch_products(ImportBatch.model_validate(entry))
    return total


def _all_unanswered_question_ids(session: MenuImportSession) -> list[str]:
    unanswered: list[str] = []
    for entry in session.draft_batches or []:
        if not isinstance(entry, dict):
            continue
        batch = ImportBatch.model_validate(entry)
        unanswered.extend(
            _unanswered_question_ids(batch, session.clarification_answers or {})
        )
    return unanswered


def apply_full_import(
    ctx: AgentContext,
    session: MenuImportSession,
    *,
    confirmed: bool,
    reconciliation: ReconciliationPlan | None = None,
) -> ApplyFullResult:
    if not confirmed:
        return ApplyFullResult(ok=False, summary="confirmed=true is required to apply full import")

    product_total = _count_session_products(session)
    limit = get_settings().menu_import_full_max_products
    if product_total > limit:
        return ApplyFullResult(
            ok=False,
            summary=f"Menu has {product_total} products; full import limit is {limit}",
        )

    unanswered = _all_unanswered_question_ids(session)
    if unanswered:
        return ApplyFullResult(
            ok=False,
            summary=(
                "Import has unanswered open_questions; save clarification answers first: "
                + ", ".join(unanswered)
            ),
        )

    batches = list(session.draft_batches or [])
    pending_indexes = [
        index
        for index, entry in enumerate(batches)
        if isinstance(entry, dict) and not entry.get("applied_at")
    ]
    if not pending_indexes:
        return ApplyFullResult(ok=False, summary="No pending batches to apply")

    totals = ApplyFullResult(ok=True, summary="")
    for batch_index in pending_indexes:
        result = apply_import_batch(
            ctx, session, batch_index, confirmed=True, reconciliation=reconciliation
        )
        if not result.ok:
            return ApplyFullResult(ok=False, summary=result.summary)
        totals = ApplyFullResult(
            ok=True,
            summary=totals.summary,
            batches_applied=totals.batches_applied + 1,
            categories=totals.categories + result.categories,
            products=totals.products + result.products,
            option_groups=totals.option_groups + result.option_groups,
            option_items=totals.option_items + result.option_items,
            promotions=totals.promotions + result.promotions,
        )

    summary = (
        f"Applied full import: {totals.batches_applied} batch(es), "
        f"{totals.categories} categories, {totals.products} products, "
        f"{totals.option_groups} option groups, {totals.option_items} option items, "
        f"{totals.promotions} promotions"
    )
    return ApplyFullResult(
        ok=True,
        summary=summary,
        batches_applied=totals.batches_applied,
        categories=totals.categories,
        products=totals.products,
        option_groups=totals.option_groups,
        option_items=totals.option_items,
        promotions=totals.promotions,
    )
