from __future__ import annotations

import re
import uuid

_ORDER_REF_RE = re.compile(r"Ref\.?\s*pedido\s*#?([A-Z0-9]{5,12})", re.IGNORECASE)
_SHORT_ID_LENGTH = 5


def order_display_id(*, order_id: uuid.UUID, note: str | None) -> str:
    if note:
        match = _ORDER_REF_RE.search(note)
        if match:
            return match.group(1).upper()[:_SHORT_ID_LENGTH]
    return str(order_id).replace("-", "")[:_SHORT_ID_LENGTH].upper()
