import hashlib
import hmac

from app.modules.justo.ingest import classify_justo_order, verify_justo_signature


def test_justo_signature_is_hmac_sha1_of_raw_body():
    raw = b'{"type":"ecommerce.order.created"}'
    secret = "whsec_test"
    signature = hmac.new(secret.encode(), raw, hashlib.sha1).hexdigest()
    assert verify_justo_signature(secret, raw, signature)
    assert verify_justo_signature(secret, raw, signature.upper())
    assert not verify_justo_signature(secret, raw, "no-es")
    assert not verify_justo_signature(None, raw, signature)


def test_justo_delivery_is_imported():
    assert classify_justo_order({"deliveryType": "delivery", "source": "justo"}) == "justo"


def test_pickup_is_ignored():
    assert classify_justo_order({"deliveryType": "go", "source": "justo"}) is None


def test_justo_managed_delivery_is_ignored():
    assert (
        classify_justo_order(
            {"deliveryType": "delivery", "source": "web", "hasManagedDelivery": True}
        )
        is None
    )


def test_rappi_is_ignored():
    assert classify_justo_order({"deliveryType": "delivery", "source": "rappi"}) is None


def test_uber_exclusive_is_imported():
    assert (
        classify_justo_order({"deliveryType": "delivery", "source": "ubereats"})
        == "uber_exclusive"
    )


def test_uber_with_external_courier_is_ignored():
    order = {
        "deliveryType": "delivery",
        "source": "ubereats",
        "hasExternalDeliveryProvider": True,
    }
    assert classify_justo_order(order) is None


def test_uber_tracking_url_means_uber_courier():
    order = {
        "deliveryType": "delivery",
        "source": "uber eats",
        "deliveries": [{"trackingURL": "https://www.uber.com/track/abc"}],
    }
    assert classify_justo_order(order) is None
