from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_cursor,
    encode_cursor,
)


def test_cursor_roundtrip():
    assert decode_cursor(encode_cursor("id_123")) == "id_123"


def test_pagination_params_defaults():
    params = PaginationParams()
    assert params.limit == 20
    assert params.cursor is None


def test_cursor_page_defaults():
    page: CursorPage[int] = CursorPage(items=[1, 2, 3])
    assert page.items == [1, 2, 3]
    assert page.has_more is False
    assert page.next_cursor is None
