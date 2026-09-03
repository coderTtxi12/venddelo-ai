import uuid
from datetime import datetime, timezone

from app.core.pagination import (
    CursorPage,
    decode_sort_keyset_cursor,
    encode_sort_keyset_cursor,
)


def test_cursor_page_total_optional():
    page = CursorPage(items=[], next_cursor=None, has_more=False)
    assert page.total is None


def test_sort_keyset_roundtrip_created_at():
    order_id = uuid.uuid4()
    created = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)
    cursor = encode_sort_keyset_cursor("created_at", created.isoformat(), order_id)
    sort, value, decoded_id = decode_sort_keyset_cursor(cursor)
    assert sort == "created_at"
    assert value == created.isoformat()
    assert decoded_id == order_id


def test_sort_keyset_roundtrip_total_cents():
    order_id = uuid.uuid4()
    cursor = encode_sort_keyset_cursor("total_cents", "5000", order_id)
    sort, value, decoded_id = decode_sort_keyset_cursor(cursor)
    assert sort == "total_cents"
    assert value == "5000"
    assert decoded_id == order_id
