from app.core.pagination import PaginationParams
from app.modules.analytics.adapters import SqlAlchemyAnalyticsRepository
from app.modules.analytics.schemas import AnalyticsGranularity
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
        customer_phone="5550001",
        payment_method="cash",
        subtotal_cents=5000,
        total_cents=5000,
        status="delivered",
    )
    base.update(kwargs)
    return OrderCreate(**base)


@requires_db
def test_analytics_summary_counts_delivered_orders(session):
    r = _restaurant(session, "an1")
    orders = SqlAlchemyOrderRepository(session)
    analytics = SqlAlchemyAnalyticsRepository(session)

    orders.add(_order(r.id, total_cents=10000))
    orders.add(_order(r.id, total_cents=20000, customer_phone="5550002"))
    orders.add(_order(r.id, total_cents=3000, status="cancelled"))

    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    summary = analytics.get_summary(
        r.id,
        period_start=now - timedelta(days=1),
        period_end=now + timedelta(days=1),
    )

    assert summary.order_count == 2
    assert summary.total_revenue_cents == 30000
    assert summary.avg_order_cents == 15000
    assert summary.cancelled_count == 1
    assert summary.cancellation_rate_pct == 33.3


@requires_db
def test_analytics_top_products_and_customers(session):
    r = _restaurant(session, "an2")
    orders = SqlAlchemyOrderRepository(session)
    analytics = SqlAlchemyAnalyticsRepository(session)

    orders.add(
        _order(
            r.id,
            customer_phone="5551111",
            customer_name="Alice",
            items=[
                OrderItemCreate(
                    product_name="Taco",
                    quantity=2,
                    unit_price_cents=2500,
                    line_total_cents=5000,
                )
            ],
        )
    )
    orders.add(
        _order(
            r.id,
            customer_phone="5551111",
            customer_name="Alice",
            total_cents=8000,
            items=[
                OrderItemCreate(
                    product_name="Burrito",
                    quantity=1,
                    unit_price_cents=8000,
                    line_total_cents=8000,
                )
            ],
        )
    )

    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    start = now - timedelta(days=1)
    end = now + timedelta(days=1)

    top_products = analytics.get_top_products(r.id, period_start=start, period_end=end)
    top_customers = analytics.get_top_customers(r.id, period_start=start, period_end=end)
    customer_stats = analytics.get_customer_stats(r.id, period_start=start, period_end=end)

    assert top_products[0].product_name == "Taco"
    assert top_products[0].quantity == 2
    assert top_customers[0].customer_name == "Alice"
    assert top_customers[0].order_count == 2
    assert customer_stats.unique_customers == 1
    assert customer_stats.repeat_customers == 1
    assert customer_stats.repeat_customer_pct == 100.0


@requires_db
def test_analytics_sales_series_daily(session):
    r = _restaurant(session, "an3")
    orders = SqlAlchemyOrderRepository(session)
    analytics = SqlAlchemyAnalyticsRepository(session)
    orders.add(_order(r.id, total_cents=4200))

    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    series = analytics.get_sales_series(
        r.id,
        timezone="America/Mexico_City",
        granularity="daily",
        period_start=now - timedelta(days=1),
        period_end=now + timedelta(days=1),
    )

    assert len(series) >= 1
    assert series[-1].revenue_cents == 4200
    assert series[-1].order_count == 1
