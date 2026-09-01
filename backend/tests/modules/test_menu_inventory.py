from datetime import UTC, date, datetime

from app.modules.menu.inventory import (
    apply_inventory_consume,
    apply_stock_write_side_effects,
    effective_expires_on,
    show_low_stock,
)


def test_show_low_stock_requires_toggle_active_tracked_qty_within_threshold():
    assert show_low_stock(
        live_menu_inventory_enabled=True,
        inventory_qty=3,
        threshold=3,
        status="active",
    )
    assert not show_low_stock(
        live_menu_inventory_enabled=False,
        inventory_qty=1,
        threshold=3,
        status="active",
    )
    assert not show_low_stock(
        live_menu_inventory_enabled=True,
        inventory_qty=None,
        threshold=3,
        status="active",
    )
    assert not show_low_stock(
        live_menu_inventory_enabled=True,
        inventory_qty=1,
        threshold=3,
        status="inactive",
    )
    assert not show_low_stock(
        live_menu_inventory_enabled=True,
        inventory_qty=0,
        threshold=3,
        status="active",
    )
    assert not show_low_stock(
        live_menu_inventory_enabled=True,
        inventory_qty=4,
        threshold=3,
        status="active",
    )


def test_effective_expires_on_prefers_custom_date_over_shelf_life():
    started = datetime(2026, 8, 1, 15, tzinfo=UTC)
    assert effective_expires_on(
        expires_on=date(2026, 8, 20),
        shelf_life_days=2,
        batch_started_at=started,
    ) == date(2026, 8, 20)
    assert effective_expires_on(
        expires_on=None,
        shelf_life_days=2,
        batch_started_at=started,
    ) == date(2026, 8, 3)
    assert effective_expires_on(
        expires_on=None,
        shelf_life_days=2,
        batch_started_at=None,
    ) is None


def test_restock_starts_batch_and_can_reactivate_when_live_toggle_on():
    now = datetime(2026, 8, 31, 12, tzinfo=UTC)
    extras = apply_stock_write_side_effects(
        previous_qty=0,
        new_qty=8,
        live_menu_inventory_enabled=True,
        current_status="inactive",
        now=now,
    )
    assert extras["batch_started_at"] == now
    assert extras["status"] == "active"


def test_rewriting_same_qty_does_not_restart_batch():
    extras = apply_stock_write_side_effects(
        previous_qty=5,
        new_qty=5,
        live_menu_inventory_enabled=True,
        current_status="active",
        now=datetime.now(UTC),
    )
    assert extras == {}


def test_zero_qty_inactivates_only_when_live_toggle_on():
    extras = apply_stock_write_side_effects(
        previous_qty=4,
        new_qty=0,
        live_menu_inventory_enabled=True,
        current_status="active",
        now=datetime.now(UTC),
    )
    assert extras == {"status": "inactive"}

    extras_off = apply_stock_write_side_effects(
        previous_qty=4,
        new_qty=0,
        live_menu_inventory_enabled=False,
        current_status="active",
        now=datetime.now(UTC),
    )
    assert extras_off == {}


def test_clearing_inventory_does_not_force_status():
    extras = apply_stock_write_side_effects(
        previous_qty=2,
        new_qty=None,
        live_menu_inventory_enabled=True,
        current_status="active",
        now=datetime.now(UTC),
    )
    assert extras == {}


def test_consume_does_not_decrement_when_live_inventory_is_off():
    qty, status, consumed = apply_inventory_consume(
        inventory_qty=5,
        quantity=2,
        live_menu_inventory_enabled=False,
        status="active",
    )
    assert (qty, status, consumed) == (5, None, False)


def test_consume_untracked_is_noop():
    qty, status, consumed = apply_inventory_consume(
        inventory_qty=None,
        quantity=2,
        live_menu_inventory_enabled=True,
        status="active",
    )
    assert (qty, status, consumed) == (None, None, False)


def test_consume_clamps_to_zero_when_insufficient():
    qty, status, consumed = apply_inventory_consume(
        inventory_qty=1,
        quantity=2,
        live_menu_inventory_enabled=True,
        status="active",
    )
    assert consumed is True
    assert qty == 0
    assert status == "inactive"


def test_consume_decrements_to_inactive_when_live():
    qty, status, consumed = apply_inventory_consume(
        inventory_qty=2,
        quantity=2,
        live_menu_inventory_enabled=True,
        status="active",
    )
    assert consumed is True
    assert qty == 0
    assert status == "inactive"

    qty_off, status_off, consumed_off = apply_inventory_consume(
        inventory_qty=2,
        quantity=2,
        live_menu_inventory_enabled=False,
        status="active",
    )
    assert consumed_off is False
    assert qty_off == 2
    assert status_off is None
