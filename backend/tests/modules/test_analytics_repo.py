from datetime import UTC, datetime, timedelta

from app.core.pagination import PaginationParams
from app.modules.analytics.adapters import SqlAlchemyAnalyticsRepository
from app.modules.analytics.schemas import AnalyticsGranularity
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import ProductCreate
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.orders.schemas import OrderCreate, OrderItemCreate
from app.modules.promotions.adapters import SqlAlchemyPromotionRepository
from app.modules.promotions.pricing import (
    CATALOG_DISCOUNT_PREFIX,
    CATALOG_DISCOUNT_SNAPSHOT_LABEL,
)
from app.modules.promotions.schemas import PromotionBundle, PromotionCreate
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


@requires_db
def test_analytics_promotion_usage_counts_item_and_order_promos(session):
    r = _restaurant(session, "an-promo")
    orders = SqlAlchemyOrderRepository(session)
    promos = SqlAlchemyPromotionRepository(session)
    analytics = SqlAlchemyAnalyticsRepository(session)

    bundle = promos.add(
        PromotionCreate(
            restaurant_id=r.id,
            name="Hamburguesas 2x1",
            type="two_for_one",
            scope="product",
        )
    )
    order_promo = promos.add(
        PromotionCreate(
            restaurant_id=r.id,
            name="10% en pedido",
            type="percent",
            scope="order",
            percent=10,
        )
    )
    catalog = promos.add(
        PromotionCreate(
            restaurant_id=r.id,
            name=f"{CATALOG_DISCOUNT_PREFIX}BURGER & BONELESS",
            type="percent",
            scope="product",
            percent=15,
        )
    )

    orders.add(
        _order(
            r.id,
            customer_phone="5552222",
            discount_cents=0,
            subtotal_cents=8000,
            total_cents=8000,
            items=[
                OrderItemCreate(
                    product_name="Burger",
                    quantity=2,
                    unit_price_cents=4000,
                    line_total_cents=4000,
                    discount_cents=4000,
                    applied_promotion_id=bundle.id,
                )
            ],
        )
    )
    orders.add(
        _order(
            r.id,
            customer_phone="5553333",
            discount_cents=500,
            subtotal_cents=5000,
            total_cents=4500,
            applied_order_promotion_id=order_promo.id,
        )
    )
    orders.add(
        _order(
            r.id,
            customer_phone="5554444",
            discount_cents=0,
            subtotal_cents=3000,
            total_cents=2550,
            items=[
                OrderItemCreate(
                    product_name="BURGER & BONELESS",
                    quantity=1,
                    unit_price_cents=3000,
                    line_total_cents=2550,
                    discount_cents=450,
                    applied_promotion_id=catalog.id,
                )
            ],
        )
    )

    now = datetime.now(UTC)
    start = now - timedelta(days=1)
    end = now + timedelta(days=1)

    usage = {
        row.promotion_name: row
        for row in analytics.get_promotion_usage(r.id, period_start=start, period_end=end, limit=10)
    }

    assert usage["Hamburguesas 2x1"].usage_count == 1
    assert usage["Hamburguesas 2x1"].discount_cents == 4000
    assert usage["10% en pedido"].usage_count == 1
    assert usage["10% en pedido"].discount_cents == 500
    assert usage["BURGER & BONELESS"].usage_count == 1
    assert usage["BURGER & BONELESS"].discount_cents == 450


@requires_db
def test_analytics_promotion_usage_counts_catalog_discount_from_item_snapshots(session):
    r = _restaurant(session, "an-promo-catalog-json")
    menu = SqlAlchemyMenuRepository(session)
    orders = SqlAlchemyOrderRepository(session)
    promos = SqlAlchemyPromotionRepository(session)
    analytics = SqlAlchemyAnalyticsRepository(session)

    product = menu.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="WINGS & FRIES",
            price_cents=24400,
        )
    )
    bundle = promos.add(
        PromotionCreate(
            restaurant_id=r.id,
            name="2x1 Alitas",
            image_path="promos/2x1.png",
            type="two_for_one",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1, pairing_mode="same_product"),
            product_ids=[product.id],
        )
    )
    catalog = promos.add(
        PromotionCreate(
            restaurant_id=r.id,
            name=f"{CATALOG_DISCOUNT_PREFIX}WINGS & FRIES",
            type="percent",
            scope="product",
            percent=15,
            product_ids=[product.id],
        )
    )

    orders.add(
        _order(
            r.id,
            customer_phone="5555555",
            discount_cents=0,
            subtotal_cents=41480,
            total_cents=20740,
            items=[
                OrderItemCreate(
                    product_id=product.id,
                    product_name="WINGS & FRIES",
                    quantity=2,
                    unit_price_cents=20740,
                    line_subtotal_cents=41480,
                    line_total_cents=20740,
                    discount_cents=20740,
                    applied_promotion_id=bundle.id,
                    applied_discounts=[
                        {
                            "label": CATALOG_DISCOUNT_SNAPSHOT_LABEL,
                            "badge": "-15%",
                            "discount_cents": 7320,
                            "applied": True,
                        },
                        {
                            "label": "2x1 Alitas",
                            "badge": "2×1",
                            "discount_cents": 13420,
                            "applied": True,
                        },
                    ],
                )
            ],
        )
    )

    now = datetime.now(UTC)
    start = now - timedelta(days=1)
    end = now + timedelta(days=1)

    usage = {
        row.promotion_name: row
        for row in analytics.get_promotion_usage(r.id, period_start=start, period_end=end, limit=10)
    }

    assert usage["WINGS & FRIES"].usage_count == 1
    assert usage["WINGS & FRIES"].discount_cents == 7320
    assert usage["2x1 Alitas"].usage_count == 1
    assert usage["2x1 Alitas"].discount_cents == 13420
    assert str(catalog.id) in {row.promotion_id for row in analytics.get_promotion_usage(
        r.id, period_start=start, period_end=end, limit=10
    )}
