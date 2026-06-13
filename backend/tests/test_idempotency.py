from app.core.idempotency import IdempotencyKey, IdempotencyStore


class FakeStore:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, object]] = {}

    def get(self, key: IdempotencyKey) -> dict[str, object] | None:
        return self._data.get(key)

    def put(self, key: IdempotencyKey, response: dict[str, object], ttl_seconds: int) -> None:
        self._data[key] = response


def test_fake_store_satisfies_protocol():
    store: IdempotencyStore = FakeStore()
    key = IdempotencyKey("abc")
    assert store.get(key) is None
    store.put(key, {"ok": True}, 60)
    assert store.get(key) == {"ok": True}
