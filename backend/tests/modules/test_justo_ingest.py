import hashlib
import hmac

import uuid

from app.modules.justo.ingest import (
    build_order_create,
    classify_justo_order,
    public_tracking_url,
    verify_justo_signature,
)


def test_justo_signature_is_hmac_sha1_of_raw_body():
    raw = b'{"type":"ecommerce.order.created"}'
    secret = "whsec_test"
    signature = hmac.new(secret.encode(), raw, hashlib.sha1).hexdigest()
    assert verify_justo_signature(secret, raw, signature)
    assert verify_justo_signature(secret, raw, signature.upper())
    assert not verify_justo_signature(secret, raw, "no-es")
    assert not verify_justo_signature(None, raw, signature)


def test_justo_admin_channel_without_source_is_imported():
    order = {"deliveryType": "delivery", "channel": "web-delivery", "hasManagedDelivery": False}
    assert classify_justo_order(order) == "webdelivery"


def test_commander_delivery_is_imported():
    order = {
        "deliveryType": "delivery",
        "source": "commander",
        "channel": "commander-delivery",
        "hasManagedDelivery": False,
    }
    assert classify_justo_order(order) == "commander"


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


def test_any_source_is_imported_when_the_restaurant_delivers():
    assert classify_justo_order({"deliveryType": "delivery", "source": "rappi"}) == "rappi"
    assert (
        classify_justo_order(
            {
                "deliveryType": "delivery",
                "source": "ubereats",
                "hasExternalDeliveryProvider": True,
                "hasManagedDelivery": False,
            }
        )
        == "ubereats"
    )


def test_real_justo_payload_maps_readable_address_items_and_cash():
    order = {
        "_id": "nsKdB9mEhbHwGcmQE",
        "source": "commander",
        "deliveryType": "delivery",
        "hasManagedDelivery": False,
        "fullCode": "C#31704063-05",
        "buyerName": "Luis Laymon",
        "phone": "+525512238144",
        "paymentType": "cash",
        "cashAmount": 200,
        "itemsPrice": 150,
        "deliveryFee": 20,
        "totalPrice": 170,
        "address": {
            "address": "Pz/YQuU/MBe2CX5ndZze73kyHDLTNyalfTyoYz8oyXA=",
            "streetAddress": "Pz/YQuU/MBe2CX5ndZze73kyHDLTNyalfTyoYz8oyXA=",
            "addressLine2": "concY+EzWTwSF4qgZxFYtgOYTrt57dgbQJVjpWKx2Ao=",
            "addressSecondary": "55700, San Francisco Coacalco, Méx., México",
            "locality": "San Francisco Coacalco",
            "location": {"lat": 19.6354625305732, "lng": -99.11067045524045},
        },
        "items": [
            {
                "amount": 1,
                "unitPrice": 150,
                "product": {"name": "Bagui Persa"},
                "comment": None,
                "options": [
                    {
                        "title": "Incluye papas",
                        "optionId": "pLedvc3h2v7f8YwzW",
                        "selections": ["1 porción de papas"],
                        "selectionsPrices": [0],
                    },
                    {
                        "title": "Elige tu picante",
                        "optionId": "oz9BLD43hJbCT3fYm",
                        "selections": ["Jalapeños"],
                        "selectionsPrices": [0],
                        "selectionsExternalIds": ["Jalapeños"],
                    },
                    {
                        "title": "Acompaña con cheddar líquido",
                        "optionId": "vrAcvQHe68C49dsNm",
                        "selections": ["Sin cheddar líquido"],
                        "selectionsPrices": [0],
                    },
                ],
            }
        ],
    }
    created = build_order_create(uuid.uuid4(), order, "commander")
    assert "Pz/YQuU" not in (created.delivery_address or "")
    assert "San Francisco Coacalco" in (created.delivery_address or "")
    assert created.delivery_latitude == 19.6354625305732
    assert created.delivery_longitude == -99.11067045524045
    assert created.total_cents == 17000
    assert created.delivery_fee_cents == 0
    assert created.cash_denomination_cents == 20000
    assert created.payment_method == "cash"
    assert created.external_source == "commander"
    assert "C#31704063-05" in (created.note or "")
    item = created.items[0]
    assert item.product_name == "Bagui Persa"
    groups = (item.selected_options or {})["__groups__"]
    assert [group["title"] for group in groups] == [
        "Incluye papas",
        "Elige tu picante",
        "Acompaña con cheddar líquido",
    ]
    assert groups[1]["choices"][0]["label"] == "Jalapeños"
    assert groups[1]["choices"][0]["price_cents"] == 0


def test_tracking_link_uses_the_restaurant_subdomain():
    assert (
        public_tracking_url("laymon", "abc123")
        == "https://laymon.mxy.mx/rastreo/abc123"
    )
