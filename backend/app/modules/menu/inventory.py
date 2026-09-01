from __future__ import annotations

from datetime import date, datetime, timedelta

from app.core.exceptions import ValidationError


def effective_expires_on(
    *,
    expires_on: date | None,
    shelf_life_days: int | None,
    batch_started_at: datetime | None,
) -> date | None:
    if expires_on is not None:
        return expires_on
    if shelf_life_days is None or batch_started_at is None:
        return None
    return batch_started_at.date() + timedelta(days=shelf_life_days)


def show_low_stock(
    *,
    live_menu_inventory_enabled: bool,
    inventory_qty: int | None,
    threshold: int,
    status: str,
) -> bool:
    if not live_menu_inventory_enabled:
        return False
    if status != "active":
        return False
    if inventory_qty is None:
        return False
    return 0 < inventory_qty <= threshold


def apply_stock_write_side_effects(
    *,
    previous_qty: int | None,
    new_qty: int | None,
    live_menu_inventory_enabled: bool,
    current_status: str,
    now: datetime,
) -> dict:
    """Side effects when inventory_qty is written (create/update).

    A restock (qty going up) starts a new batch. Rewriting the same qty — which
    every product edit does when inventory is sent alongside unrelated fields —
    must leave the batch clock and status untouched.
    """
    out: dict = {}
    if new_qty is not None and new_qty > (previous_qty or 0):
        out["batch_started_at"] = now
        if live_menu_inventory_enabled and current_status == "inactive":
            out["status"] = "active"
    elif new_qty == 0 and live_menu_inventory_enabled and current_status == "active":
        out["status"] = "inactive"
    return out


def apply_inventory_consume(
    *,
    inventory_qty: int | None,
    quantity: int,
    live_menu_inventory_enabled: bool,
    status: str,
) -> tuple[int | None, str | None, bool]:
    if not live_menu_inventory_enabled:
        return inventory_qty, None, False
    if inventory_qty is None:
        return None, None, False
    if quantity < 1:
        raise ValidationError("Quantity must be at least 1")
    new_qty = max(0, inventory_qty - quantity)
    new_status = None
    if new_qty == 0 and status == "active":
        new_status = "inactive"
    return new_qty, new_status, True
