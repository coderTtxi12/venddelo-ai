import uuid

from app.modules.orders.display_id import order_display_id


def test_order_display_id_prefers_checkout_ref_in_note():
    order_id = uuid.UUID("11111111-2222-3333-4444-555555555555")
    assert (
        order_display_id(
            order_id=order_id,
            note="Ref. pedido #K7M2P | sin cebolla",
        )
        == "K7M2P"
    )


def test_order_display_id_truncates_legacy_eight_char_ref():
    order_id = uuid.UUID("11111111-2222-3333-4444-555555555555")
    assert (
        order_display_id(
            order_id=order_id,
            note="Ref. pedido #A1B2C3D4 | sin cebolla",
        )
        == "A1B2C"
    )


def test_order_display_id_falls_back_to_uuid_prefix():
    order_id = uuid.UUID("abcdef12-3456-7890-abcd-ef1234567890")
    assert order_display_id(order_id=order_id, note=None) == "ABCDE"
    assert order_display_id(order_id=order_id, note="sin referencia") == "ABCDE"
