from app.modules.delivery_dispatch.short_id import (
    SHORT_ID_ALPHABET,
    SHORT_ID_LENGTH,
    generate_dispatch_short_id,
)


def test_short_id_uses_unambiguous_alphabet_and_fixed_length():
    value = generate_dispatch_short_id()
    assert len(value) == SHORT_ID_LENGTH
    assert all(char in SHORT_ID_ALPHABET for char in value)


def test_short_id_generation_is_unique_across_samples():
    samples = {generate_dispatch_short_id() for _ in range(200)}
    assert len(samples) == 200
