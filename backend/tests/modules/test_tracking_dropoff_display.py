from app.modules.delivery_dispatch.tracking_view import tracking_dropoff_display


def test_tracking_dropoff_display_uses_menu_references_from_order_when_dispatch_stripped_them():
    address, references = tracking_dropoff_display(
        "Blvd. de las Rosas 206, Villa de las Flores",
        order_delivery_address=(
            "Blvd. de las Rosas 206, Villa de las Flores\n"
            "Referencias: casa blanca, portón negro"
        ),
    )
    assert address == "Blvd. de las Rosas 206, Villa de las Flores"
    assert references == "casa blanca, portón negro"


def test_tracking_dropoff_display_splits_dispatch_separator_without_order():
    address, references = tracking_dropoff_display("Nueva 9 · portón negro")
    assert address == "Nueva 9"
    assert references == "portón negro"


def test_tracking_dropoff_display_omits_references_when_missing():
    address, references = tracking_dropoff_display(
        "Blvd. de las Rosas 206, Villa de las Flores",
        order_delivery_address="Blvd. de las Rosas 206, Villa de las Flores",
    )
    assert address == "Blvd. de las Rosas 206, Villa de las Flores"
    assert references is None
