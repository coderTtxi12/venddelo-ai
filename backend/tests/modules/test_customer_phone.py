from datetime import UTC, datetime
from uuid import UUID

from app.modules.customers.grouping import (
    CustomerEvent,
    apply_customer_filters,
    customer_stats,
    filter_by_source,
    group_customer_events,
    matches_query,
    order_display_id,
    sort_customers,
)
from app.modules.customers.phone import customer_phone_key


def test_phone_key_groups_mexican_formats():
    assert customer_phone_key("+525512345678") == "5512345678"
    assert customer_phone_key("5512345678") == "5512345678"
    assert customer_phone_key("52 55 1234 5678") == "5512345678"
    assert customer_phone_key("+52 1 55 1234 5678") == "5512345678"


def test_phone_key_handles_legacy_and_empty():
    assert customer_phone_key("whatsapp") == "whatsapp"
    assert customer_phone_key("  ") == "unknown"
    assert customer_phone_key(None) == "unknown"


def _event(**kwargs) -> CustomerEvent:
    base = dict(
        id="1",
        source="menu",
        customer_name="María",
        customer_phone="+525512345678",
        created_at=datetime(2026, 8, 1, tzinfo=UTC),
        total_cents=12000,
        status="delivered",
        order_type="takeout",
        display_id="ABC12",
    )
    base.update(kwargs)
    return CustomerEvent(**base)


def test_group_customer_events_merges_phone_variants_and_sources():
    later = datetime(2026, 8, 20, tzinfo=UTC)
    earlier = datetime(2026, 8, 2, tzinfo=UTC)
    customers = group_customer_events(
        [
            _event(
                id="menu-1",
                customer_phone="+525512345678",
                customer_name="María López",
                created_at=earlier,
                total_cents=10000,
            ),
            _event(
                id="menu-2",
                customer_phone="5512345678",
                customer_name="Maria",
                created_at=later,
                status="pending",
                total_cents=8000,
            ),
            _event(
                id="del-1",
                source="delivery",
                customer_phone="52 55 1234 5678",
                created_at=datetime(2026, 8, 10, tzinfo=UTC),
                total_cents=25000,
                status="delivered",
                order_type="delivery",
                display_id="ZX9K",
            ),
            _event(
                id="other",
                customer_phone="5550001111",
                customer_name="Luis",
                created_at=datetime(2026, 8, 15, tzinfo=UTC),
            ),
        ]
    )

    by_key = {customer.phone_key: customer for customer in customers}
    maria = by_key["5512345678"]
    assert maria.order_count == 2
    assert maria.delivery_count == 1
    assert maria.visit_count == 3
    assert maria.total_spent_cents == 35000
    assert maria.customer_name == "Maria"
    assert maria.sources == ["menu", "delivery"]
    assert "other" not in maria.phone_key
    assert by_key["5550001111"].visit_count == 1


def test_stats_and_filters():
    customers = group_customer_events(
        [
            _event(id="a", customer_phone="1111111111"),
            _event(
                id="b",
                customer_phone="1111111111",
                created_at=datetime(2026, 8, 2, tzinfo=UTC),
            ),
            _event(id="c", source="delivery", customer_phone="2222222222"),
        ]
    )
    stats = customer_stats(customers)
    assert stats.unique_customers == 2
    assert stats.repeat_customers == 1
    assert stats.menu_customers == 1
    assert stats.delivery_customers == 1
    assert len(filter_by_source(customers, "delivery")) == 1


def test_matches_query_uses_name_and_digits():
    customer = group_customer_events([_event()])[0]
    assert matches_query(customer, "maría")
    assert matches_query(customer, "551234")
    assert not matches_query(customer, "pedro")


def test_sort_customers_by_spent_and_name():
    customers = group_customer_events(
        [
            _event(id="cheap", customer_phone="1111111111", total_cents=1000, customer_name="Zeta"),
            _event(id="rich", customer_phone="2222222222", total_cents=9000, customer_name="Ana"),
        ]
    )
    by_spent = sort_customers(customers, "spent")
    assert by_spent[0].customer_name == "Ana"
    by_name = sort_customers(customers, "name")
    assert by_name[0].customer_name == "Ana"


def test_sort_customers_reverses_with_order():
    customers = group_customer_events(
        [
            _event(
                id="cheap",
                customer_phone="1111111111",
                total_cents=1000,
                customer_name="Zeta",
                created_at=datetime(2026, 8, 1, tzinfo=UTC),
            ),
            _event(
                id="rich",
                customer_phone="2222222222",
                total_cents=9000,
                customer_name="Ana",
                created_at=datetime(2026, 8, 20, tzinfo=UTC),
            ),
        ]
    )
    spent_asc = sort_customers(customers, "spent", order="asc")
    assert [item.customer_name for item in spent_asc] == ["Zeta", "Ana"]
    name_desc = sort_customers(customers, "name", order="desc")
    assert [item.customer_name for item in name_desc] == ["Zeta", "Ana"]
    last_asc = sort_customers(customers, "last_at", order="asc")
    assert [item.customer_name for item in last_asc] == ["Zeta", "Ana"]
    visits_desc = sort_customers(customers, "visits", order="desc")
    assert len(visits_desc) == 2


def test_apply_customer_filters_frequency_spend_recency():
    now = datetime(2026, 8, 22, tzinfo=UTC)
    customers = group_customer_events(
        [
            _event(id="a", customer_phone="1111111111"),
            _event(
                id="b",
                customer_phone="1111111111",
                created_at=datetime(2026, 8, 20, tzinfo=UTC),
            ),
            _event(
                id="c",
                customer_phone="2222222222",
                customer_name="Luis",
                total_cents=0,
                status="pending",
            ),
        ]
    )
    assert [c.phone_key for c in apply_customer_filters(customers, frequency="repeat")] == [
        "1111111111"
    ]
    assert [c.phone_key for c in apply_customer_filters(customers, frequency="new")] == [
        "2222222222"
    ]
    assert [c.phone_key for c in apply_customer_filters(customers, spend="none")] == [
        "2222222222"
    ]
    recent = apply_customer_filters(customers, recency="7d", now=now)
    assert [c.phone_key for c in recent] == ["1111111111"]
    assert len(apply_customer_filters(customers, recency="30d", now=now)) == 2


def test_order_display_id_prefers_note_ref():
    order_id = UUID("11111111-2222-3333-4444-555555555555")
    assert order_display_id("Ref. pedido #AB12C extra", order_id) == "AB12C"
    assert order_display_id(None, order_id) == "11111"


def test_latest_delivery_address_prefers_most_recent():
    from app.modules.customers.grouping import latest_delivery_address

    events = [
        _event(
            id="old",
            order_type="delivery",
            delivery_address="Calle Vieja 1",
            created_at=datetime(2026, 7, 1, tzinfo=UTC),
        ),
        _event(
            id="new",
            source="delivery",
            order_type="delivery",
            delivery_address="Av. Nueva 99",
            delivery_maps_url="https://maps.example/new",
            created_at=datetime(2026, 8, 20, tzinfo=UTC),
        ),
    ]
    address, maps_url = latest_delivery_address(events)
    assert address == "Av. Nueva 99"
    assert maps_url == "https://maps.example/new"


def test_latest_delivery_address_prefers_coordinates_over_text_maps_url():
    from app.modules.customers.grouping import latest_delivery_address

    events = [
        _event(
            id="new",
            source="delivery",
            order_type="delivery",
            delivery_address="Av. Nueva 99",
            delivery_latitude=19.635,
            delivery_longitude=-99.095,
            delivery_maps_url="https://maps.example/search?q=Av+Nueva",
            created_at=datetime(2026, 8, 20, tzinfo=UTC),
        ),
    ]
    address, maps_url = latest_delivery_address(events)
    assert address == "Av. Nueva 99"
    assert maps_url == "https://www.google.com/maps?q=19.635,-99.095"
