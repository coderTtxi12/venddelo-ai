from app.core.pagination import PaginationParams
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.orders.schemas import OrderCreate, OrderItemCreate
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
        type="delivery",
        customer_name="Juan",
        customer_phone="555",
        payment_method="cash",
        subtotal_cents=5000,
        total_cents=5000,
    )
    base.update(kwargs)
    return OrderCreate(**base)


@requires_db
def test_add_order_with_items(session):
    r = _restaurant(session, "ord1")
    repo = SqlAlchemyOrderRepository(session)
    dto = repo.add(
        _order(
            r.id,
            items=[
                OrderItemCreate(
                    product_name="Taco",
                    quantity=2,
                    unit_price_cents=2500,
                    line_total_cents=5000,
                    selected_options={"size": "L"},
                )
            ],
        )
    )
    assert len(dto.items) == 1
    assert repo.get(dto.id).total_cents == 5000


@requires_db
def test_update_status(session):
    r = _restaurant(session, "ord2")
    repo = SqlAlchemyOrderRepository(session)
    dto = repo.add(_order(r.id))
    updated = repo.update_status(dto.id, "confirmed")
    assert updated.status == "confirmed"


@requires_db
def test_list_by_restaurant_status_filter_and_pagination(session):
    r = _restaurant(session, "ord3")
    repo = SqlAlchemyOrderRepository(session)
    for _ in range(3):
        repo.add(_order(r.id))
    repo.add(_order(r.id, status="confirmed"))
    page = repo.list_by_restaurant(r.id, PaginationParams(limit=2), status="pending")
    assert len(page.items) == 2
    assert page.next_cursor is not None
    confirmed = repo.list_by_restaurant(r.id, PaginationParams(limit=10), status="confirmed")
    assert len(confirmed.items) == 1


@requires_db
def test_get_by_idempotency_key(session):
    r = _restaurant(session, "ord4")
    repo = SqlAlchemyOrderRepository(session)
    repo.add(_order(r.id, idempotency_key="abc"))
    assert repo.get_by_idempotency_key(r.id, "abc") is not None
    assert repo.get_by_idempotency_key(r.id, "missing") is None
