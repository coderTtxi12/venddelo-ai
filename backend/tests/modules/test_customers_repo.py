from app.core.pagination import PaginationParams
from app.core.pagination import PaginationParams
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.orders.schemas import OrderCreate
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


def _order(restaurant_id, **kwargs) -> OrderCreate:
    base = dict(
        restaurant_id=restaurant_id,
        type="takeout",
        customer_name="Juan",
        customer_phone="+525512345678",
        payment_method="cash",
        subtotal_cents=5000,
        total_cents=5000,
        status="delivered",
    )
    base.update(kwargs)
    return OrderCreate(**base)


@requires_db
def test_list_customers_groups_phone_variants(session):
    restaurant = _restaurant(session, "cust-group")
    orders = SqlAlchemyOrderRepository(session)
    customers = SqlAlchemyCustomerRepository(session)

    orders.add(_order(restaurant.id, customer_name="María", customer_phone="+525512345678", total_cents=10000))
    orders.add(_order(restaurant.id, customer_name="Maria L", customer_phone="5512345678", total_cents=4000))
    orders.add(
        _order(
            restaurant.id,
            customer_name="Luis",
            customer_phone="5550001111",
            total_cents=2000,
            status="pending",
        )
    )

    page = customers.list_for_restaurant(restaurant.id, PaginationParams(limit=20))

    assert page.stats.unique_customers == 2
    assert page.stats.repeat_customers == 1
    maria = next(item for item in page.items if item.phone_key == "5512345678")
    assert maria.order_count == 2
    assert maria.total_spent_cents == 14000
    luis = next(item for item in page.items if item.phone_key == "5550001111")
    assert luis.total_spent_cents == 0
    assert luis.visit_count == 1


@requires_db
def test_list_customers_search_and_pagination(session):
    restaurant = _restaurant(session, "cust-page")
    orders = SqlAlchemyOrderRepository(session)
    customers = SqlAlchemyCustomerRepository(session)

    orders.add(_order(restaurant.id, customer_name="Ana", customer_phone="1111111111"))
    orders.add(_order(restaurant.id, customer_name="Beto", customer_phone="2222222222"))
    orders.add(_order(restaurant.id, customer_name="Carla", customer_phone="3333333333"))

    first = customers.list_for_restaurant(
        restaurant.id,
        PaginationParams(limit=2),
        sort="name",
    )
    assert [item.customer_name for item in first.items] == ["Ana", "Beto"]
    assert first.has_more is True
    assert first.total == 3

    second = customers.list_for_restaurant(
        restaurant.id,
        PaginationParams(limit=2, cursor=first.next_cursor),
        sort="name",
    )
    assert [item.customer_name for item in second.items] == ["Carla"]
    assert second.has_more is False

    by_page = customers.list_for_restaurant(
        restaurant.id,
        PaginationParams(limit=2),
        sort="name",
        page=2,
    )
    assert [item.customer_name for item in by_page.items] == ["Carla"]
    assert by_page.total == 3
    assert by_page.has_more is False

    searched = customers.list_for_restaurant(
        restaurant.id,
        PaginationParams(limit=20),
        query="bet",
    )
    assert len(searched.items) == 1
    assert searched.items[0].customer_name == "Beto"
    assert searched.total == 1


@requires_db
def test_customer_activity_lists_orders_for_phone_key(session):
    restaurant = _restaurant(session, "cust-act")
    orders = SqlAlchemyOrderRepository(session)
    customers = SqlAlchemyCustomerRepository(session)

    first = orders.add(_order(restaurant.id, note="Ref. pedido #AB12C", total_cents=3000))
    orders.add(_order(restaurant.id, customer_phone="5512345678", total_cents=7000))
    orders.add(_order(restaurant.id, customer_phone="5559990000", customer_name="Otro"))

    activity = customers.activity_for_phone(
        restaurant.id,
        "5512345678",
        PaginationParams(limit=20),
    )
    assert activity is not None
    assert len(activity.items) == 2
    assert activity.total == 2
    assert activity.has_more is False
    assert activity.summary.menu_count == 2
    assert len(activity.summary.timeline) == 2
    assert any(item.display_id == "AB12C" for item in activity.items)
    assert activity.phone_key == "5512345678"
    assert first.id is not None


@requires_db
def test_customer_activity_pagination_and_sort(session):
    restaurant = _restaurant(session, "cust-act-page")
    orders = SqlAlchemyOrderRepository(session)
    customers = SqlAlchemyCustomerRepository(session)

    for cents in (1000, 2000, 3000, 4000, 5000):
        orders.add(
            _order(
                restaurant.id,
                customer_phone="5512345678",
                total_cents=cents,
                status="delivered",
            )
        )

    first_page = customers.activity_for_phone(
        restaurant.id,
        "5512345678",
        PaginationParams(limit=2),
        sort="amount-desc",
    )
    assert first_page is not None
    assert len(first_page.items) == 2
    assert first_page.total == 5
    assert first_page.has_more is True
    assert first_page.items[0].total_cents == 5000

    second_page = customers.activity_for_phone(
        restaurant.id,
        "5512345678",
        PaginationParams(limit=2, cursor=first_page.next_cursor),
        sort="amount-desc",
    )
    assert second_page is not None
    assert len(second_page.items) == 2
    assert second_page.items[0].total_cents == 4000
