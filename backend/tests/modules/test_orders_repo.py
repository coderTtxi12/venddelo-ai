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
def test_list_by_restaurant_eager_loads_items_bounded_queries(session, engine):
    from sqlalchemy import event

    r = _restaurant(session, "ord5")
    repo = SqlAlchemyOrderRepository(session)
    for index in range(3):
        repo.add(
            _order(
                r.id,
                items=[
                    OrderItemCreate(
                        product_name=f"Item {index}",
                        quantity=1,
                        unit_price_cents=1000,
                        line_total_cents=1000,
                    )
                ],
            )
        )

    query_count = {"n": 0}

    def before_cursor_execute(
        conn, cursor, statement, parameters, context, executemany
    ) -> None:
        query_count["n"] += 1

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        page = repo.list_by_restaurant(r.id, PaginationParams(limit=10))
        assert len(page.items) == 3
        assert all(len(order.items) == 1 for order in page.items)
        assert query_count["n"] <= 4
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


@requires_db
def test_list_by_restaurant_view_active_and_archive(session):
    r = _restaurant(session, "ord6")
    repo = SqlAlchemyOrderRepository(session)
    repo.add(_order(r.id, status="pending"))
    repo.add(_order(r.id, status="confirmed"))
    repo.add(_order(r.id, status="delivered"))
    repo.add(_order(r.id, status="cancelled"))

    active = repo.list_by_restaurant(r.id, PaginationParams(limit=10), view="active")
    archive = repo.list_by_restaurant(r.id, PaginationParams(limit=10), view="archive")

    assert len(active.items) == 2
    assert {item.status for item in active.items} == {"pending", "confirmed"}
    assert len(archive.items) == 2
    assert {item.status for item in archive.items} == {"delivered", "cancelled"}


@requires_db
def test_status_summary_counts(session):
    r = _restaurant(session, "ord7")
    repo = SqlAlchemyOrderRepository(session)
    repo.add(_order(r.id, status="pending"))
    repo.add(_order(r.id, status="pending"))
    repo.add(_order(r.id, status="ready"))
    repo.add(_order(r.id, status="delivered"))

    summary = repo.status_summary(r.id)

    assert summary.pending == 2
    assert summary.ready == 1
    assert summary.delivered == 1
    assert summary.active == 3
    assert summary.total == 4


@requires_db
def test_get_by_idempotency_key(session):
    r = _restaurant(session, "ord4")
    repo = SqlAlchemyOrderRepository(session)
    repo.add(_order(r.id, idempotency_key="abc"))
    assert repo.get_by_idempotency_key(r.id, "abc") is not None
    assert repo.get_by_idempotency_key(r.id, "missing") is None


@requires_db
def test_kitchen_list_and_summary_hide_cleared_closed_orders(session):
    r = _restaurant(session, "ord-kds-1")
    repo = SqlAlchemyOrderRepository(session)
    repo.add(_order(r.id, status="pending"))
    delivered = repo.add(_order(r.id, status="delivered"))
    repo.add(_order(r.id, status="cancelled"))

    cleared = repo.clear_closed_from_kds(r.id)
    assert cleared == 2
    assert repo.get(delivered.id).kds_cleared_at is not None

    kitchen = repo.list_by_restaurant(r.id, PaginationParams(limit=10), board="kitchen")
    history = repo.list_by_restaurant(r.id, PaginationParams(limit=10), board="history")
    summary = repo.status_summary(r.id, board="kitchen")
    history_summary = repo.status_summary(r.id, board="history")

    assert [item.status for item in kitchen.items] == ["pending"]
    assert {item.status for item in history.items} == {"delivered", "cancelled"}
    assert summary.pending == 1
    assert summary.delivered == 0
    assert summary.cancelled == 0
    assert summary.active == 1
    assert summary.total == 1
    assert history_summary.delivered == 1
    assert history_summary.cancelled == 1
    assert history_summary.total == 2
    assert history_summary.active == 0


@requires_db
def test_clear_closed_from_kds_skips_active_and_already_cleared(session):
    r = _restaurant(session, "ord-kds-2")
    repo = SqlAlchemyOrderRepository(session)
    repo.add(_order(r.id, status="preparing"))
    repo.add(_order(r.id, status="delivered"))

    assert repo.clear_closed_from_kds(r.id) == 1
    assert repo.clear_closed_from_kds(r.id) == 0

    kitchen = repo.list_by_restaurant(r.id, PaginationParams(limit=10), board="kitchen")
    assert [item.status for item in kitchen.items] == ["preparing"]
