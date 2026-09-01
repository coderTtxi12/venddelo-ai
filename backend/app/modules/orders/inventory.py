from __future__ import annotations

import uuid
from collections import Counter
from collections.abc import Iterable
from typing import Protocol


class _OrderLine(Protocol):
    product_id: uuid.UUID | None
    quantity: int


def should_consume_inventory_on_transition(previous_status: str, next_status: str) -> bool:
    return previous_status == "pending" and next_status == "confirmed"


def quantities_to_consume(items: Iterable[_OrderLine]) -> list[tuple[uuid.UUID, int]]:
    quantities: Counter[uuid.UUID] = Counter()
    for item in items:
        if item.product_id is None or item.quantity < 1:
            continue
        quantities[item.product_id] += item.quantity
    return sorted(quantities.items(), key=lambda pair: pair[0])
