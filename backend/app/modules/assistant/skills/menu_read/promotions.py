"""Read-only promotion payload helpers for the menu_read skill.

Pure functions that turn a ``PromotionDTO`` into an LLM-friendly dict with a
human label, resolved product/category names, and a plain-language explanation.
No DB access here — callers pass the id→name maps. See ``docs/promociones-referencia.en.md``.
"""

from __future__ import annotations

from app.modules.promotions.pricing import CATALOG_DISCOUNT_PREFIX
from app.modules.promotions.schemas import PromotionDTO
from app.modules.promotions.types import serialize_promotion_type

# 0=Mon … 6=Sun (matches recurrence_weekdays convention).
_WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def is_catalog_discount(promo: PromotionDTO) -> bool:
    """True when the promo is an auto-generated product-editor discount."""
    return (
        promo.scope == "product"
        and promo.type in ("percent", "amount")
        and promo.name.startswith(CATALOG_DISCOUNT_PREFIX)
    )


def promotion_display_name(promo: PromotionDTO) -> str:
    """Owner-facing name (strips the internal catalog-discount prefix)."""
    if promo.name.startswith(CATALOG_DISCOUNT_PREFIX):
        stripped = promo.name[len(CATALOG_DISCOUNT_PREFIX):].strip()
        return stripped or "(descuento de producto)"
    return promo.name


def discount_label(promo: PromotionDTO) -> str:
    """Short badge label: ``2×1``, ``-15%``, ``-$20.00``, ``Combo``."""
    api_type = serialize_promotion_type(promo.type)
    if api_type == "bundle":
        get_q = promo.bundle_get_quantity or 2
        pay_q = promo.bundle_pay_quantity or 1
        return f"{get_q}×{pay_q}"
    if api_type == "percent" and promo.percent is not None:
        return f"-{promo.percent}%"
    if api_type == "amount" and promo.amount_cents is not None:
        return f"-${promo.amount_cents / 100:.2f}"
    if api_type == "combo":
        return "Combo"
    return api_type


def schedule_summary(promo: PromotionDTO) -> dict | None:
    """Weekday + daily-window summary, or None when the promo runs anytime."""
    weekdays = promo.recurrence_weekdays or []
    start = promo.recurrence_start_time
    end = promo.recurrence_end_time
    if not weekdays and not start and not end:
        return None
    return {
        "weekdays": weekdays,
        "weekday_names": [_WEEKDAY_NAMES[d] for d in weekdays if 0 <= d <= 6],
        "daily_start_time": start.strftime("%H:%M") if start else None,
        "daily_end_time": end.strftime("%H:%M") if end else None,
    }


def promotion_payload(
    promo: PromotionDTO,
    *,
    product_names: dict[str, str] | None = None,
    category_names: dict[str, str] | None = None,
) -> dict:
    """LLM-friendly promotion dict with label, scope targets, and pricing notes."""
    product_names = product_names or {}
    category_names = category_names or {}
    api_type = serialize_promotion_type(promo.type)

    payload: dict = {
        "id": str(promo.id),
        "name": promotion_display_name(promo),
        "type": api_type,
        "scope": promo.scope,
        "label": discount_label(promo),
        "is_active": promo.is_active,
        "effective_status": promo.effective_status,
        "is_catalog_discount": is_catalog_discount(promo),
        "priced_in_cart": api_type != "combo",
    }

    if api_type == "percent":
        payload["percent"] = promo.percent
    elif api_type == "amount":
        payload["amount_cents"] = promo.amount_cents
    elif api_type == "bundle":
        payload["bundle"] = {
            "get_quantity": promo.bundle_get_quantity,
            "pay_quantity": promo.bundle_pay_quantity,
            "pairing_mode": promo.bundle_pairing_mode or "cross_product",
        }

    if promo.scope == "order" and promo.min_order_cents:
        payload["min_order_cents"] = promo.min_order_cents

    if promo.starts_at or promo.ends_at:
        payload["campaign"] = {
            "starts_at": promo.starts_at.isoformat() if promo.starts_at else None,
            "ends_at": promo.ends_at.isoformat() if promo.ends_at else None,
        }

    schedule = schedule_summary(promo)
    if schedule is not None:
        payload["schedule"] = schedule

    product_ids = [str(pid) for pid in promo.product_ids]
    category_ids = [str(cid) for cid in promo.category_ids]
    if product_ids:
        payload["products"] = [
            {"id": pid, "name": product_names.get(pid)} for pid in product_ids
        ]
    if category_ids:
        payload["categories"] = [
            {"id": cid, "name": category_names.get(cid)} for cid in category_ids
        ]
    if promo.option_item_ids:
        payload["option_item_ids"] = [str(oid) for oid in promo.option_item_ids]

    payload["pricing_note"] = _pricing_note(promo, api_type)
    return payload


def _pricing_note(promo: PromotionDTO, api_type: str) -> str:
    """One-line, owner-facing explanation of how the promo affects the total."""
    if api_type == "bundle":
        get_q = promo.bundle_get_quantity or 2
        pay_q = promo.bundle_pay_quantity or 1
        pairing = promo.bundle_pairing_mode or "cross_product"
        mix = (
            "del mismo producto"
            if pairing == "same_product"
            else "combinando productos de la promoción"
        )
        free = get_q - pay_q
        return (
            f"Lleva {get_q} y paga {pay_q} ({mix}). "
            f"Las {free} unidad(es) de menor precio base salen gratis; "
            "los complementos con costo siempre se cobran."
        )
    if api_type == "percent":
        return f"Descuenta {promo.percent}% del subtotal afectado."
    if api_type == "amount":
        return f"Descuenta ${(promo.amount_cents or 0) / 100:.2f} del subtotal afectado."
    if api_type == "combo":
        return "Solo etiqueta visual en el menú; no aplica descuento en el carrito."
    return ""
