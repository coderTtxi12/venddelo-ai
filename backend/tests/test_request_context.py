from app.core.request_context import get_request_id, set_request_id


def test_default_request_id():
    assert get_request_id() == "-"


def test_set_and_get_request_id():
    set_request_id("abc-123")
    assert get_request_id() == "abc-123"
