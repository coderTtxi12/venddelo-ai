from app.modules.delivery_dispatch.short_id import (
    SHORT_ID_ALPHABET,
    SHORT_ID_LENGTH,
    claim_dispatch_short_id,
    generate_dispatch_short_id,
)


def test_short_id_uses_unambiguous_alphabet_and_fixed_length():
    value = generate_dispatch_short_id()
    assert len(value) == SHORT_ID_LENGTH
    assert all(char in SHORT_ID_ALPHABET for char in value)


def test_short_id_generation_is_unique_across_samples():
    samples = {generate_dispatch_short_id() for _ in range(200)}
    assert len(samples) == 200


def test_claim_prefers_unused_order_display_id():
    class _Session:
        def scalar(self, _stmt):
            return None

    assert claim_dispatch_short_id(_Session(), "A1B2C3D4") == "A1B2C3D4"


def test_claim_ignores_invalid_preferred_and_allocates():
    class _Session:
        def scalar(self, _stmt):
            return None

    claimed = claim_dispatch_short_id(_Session(), "??")
    assert len(claimed) == SHORT_ID_LENGTH
    assert all(char in SHORT_ID_ALPHABET for char in claimed)
