import hashlib
import hmac

import uuid

from app.db.models.orders import Order, OrderItem
from app.modules.justo.ingest import (
    adjusted_collect_cents,
    apply_justo_order_contents,
    build_order_create,
    classify_justo_order,
    justo_event_action,
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
    assert created.delivery_fee_cents == 2000
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


def test_order_items_updated_uses_the_same_url_as_new_order():
    assert justo_event_action("newOrder") == "create"
    assert justo_event_action("orderItemsUpdated") == "update"
    assert justo_event_action("orderStatusUpdated") == "ignore"


def test_order_items_updated_replaces_items_total_and_change():
    restaurant_id = uuid.uuid4()
    order = Order(
        restaurant_id=restaurant_id,
        type="delivery",
        customer_name="Luis Laymon",
        customer_phone="+525512238144",
        payment_method="cash",
        subtotal_cents=15000,
        subtotal_before_discount_cents=15000,
        total_cents=17000,
        status="confirmed",
        delivery_fee_cents=2000,
        cash_denomination_cents=20000,
        external_source="commander",
        external_id="nsKdB9mEhbHwGcmQE",
    )
    order.items = [
        OrderItem(
            product_name="Bagui Persa",
            quantity=1,
            unit_price_cents=15000,
            line_subtotal_cents=15000,
            line_total_cents=15000,
        )
    ]
    previous = apply_justo_order_contents(
        order,
        {
            "_id": "nsKdB9mEhbHwGcmQE",
            "source": "commander",
            "buyerName": "Luis Laymon",
            "phone": "+525512238144",
            "paymentType": "cash",
            "cashAmount": 300,
            "deliveryFee": 25,
            "totalPrice": 245,
            "items": [
                {
                    "amount": 1,
                    "unitPrice": 220,
                    "product": {"name": "Bagui Persa"},
                    "options": [
                        {
                            "title": "Elige tu picante",
                            "optionId": "picante",
                            "selections": ["Habanero"],
                            "selectionsPrices": [0],
                        }
                    ],
                }
            ],
        },
        "commander",
    )
    assert previous == 17000
    assert order.total_cents == 24500
    assert order.cash_denomination_cents == 30000
    assert order.delivery_fee_cents == 2500
    assert order.status == "confirmed"
    assert order.external_id == "nsKdB9mEhbHwGcmQE"
    assert len(order.items) == 1
    assert order.items[0].product_name == "Bagui Persa"
    groups = order.items[0].selected_options["__groups__"]
    assert groups[0]["choices"][0]["label"] == "Habanero"


def test_assigned_rider_collect_moves_with_the_order_total():
    assert adjusted_collect_cents(12500, 17000, 22000) == 17500
    assert adjusted_collect_cents(17000, 17000, 22000) == 22000
    assert adjusted_collect_cents(1000, 17000, 0) == 0


def test_tracking_link_uses_the_restaurant_subdomain():
    assert (
        public_tracking_url("laymon", "abc123")
        == "https://laymon.mxy.mx/rastreo/abc123"
    )
