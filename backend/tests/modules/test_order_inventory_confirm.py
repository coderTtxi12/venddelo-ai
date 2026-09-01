import uuid

from app.modules.orders.inventory import (
    quantities_to_consume,
    should_consume_inventory_on_transition,
)


def test_stock_decrements_only_when_kitchen_confirms():
    assert should_consume_inventory_on_transition("pending", "confirmed") is True
    assert should_consume_inventory_on_transition("pending", "cancelled") is False
    assert should_consume_inventory_on_transition("confirmed", "preparing") is False
    assert should_consume_inventory_on_transition("preparing", "ready") is False
    assert should_consume_inventory_on_transition("ready", "delivered") is False


def test_quantities_to_consume_aggregates_and_skips_missing_product():
    product_a = uuid.uuid4()
    product_b = uuid.uuid4()
    items = [
        type("Item", (), {"product_id": product_a, "quantity": 2})(),
        type("Item", (), {"product_id": product_a, "quantity": 1})(),
        type("Item", (), {"product_id": None, "quantity": 4})(),
        type("Item", (), {"product_id": product_b, "quantity": 3})(),
    ]
    qty = quantities_to_consume(items)
    assert qty == sorted(
        [(product_a, 3), (product_b, 3)],
        key=lambda pair: pair[0],
    )
