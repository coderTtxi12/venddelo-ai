from app.core.pagination import PaginationParams
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.promotions.adapters import SqlAlchemyPromotionRepository
from app.modules.promotions.schemas import PromotionCreate
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


def _restaurant(session, subdomain: str):
    return SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="R", subdomain=subdomain)
    )


@requires_db
def test_add_promotion_with_products(session):
    r = _restaurant(session, "promo1")
    menu = SqlAlchemyMenuRepository(session)
    p1 = menu.add_product(ProductCreate(restaurant_id=r.id, name="P1", price_cents=100))
    p2 = menu.add_product(ProductCreate(restaurant_id=r.id, name="P2", price_cents=200))
    repo = SqlAlchemyPromotionRepository(session)
    promo = repo.add(
        PromotionCreate(
            restaurant_id=r.id,
            name="2x1",
            type="percent",
            scope="product",
            percent=50,
            product_ids=[p1.id, p2.id],
        )
    )
    assert set(promo.product_ids) == {p1.id, p2.id}
    assert set(repo.get(promo.id).product_ids) == {p1.id, p2.id}


@requires_db
def test_set_categories(session):
    r = _restaurant(session, "promo2")
    menu = SqlAlchemyMenuRepository(session)
    c1 = menu.add_category(CategoryCreate(restaurant_id=r.id, name="C1"))
    repo = SqlAlchemyPromotionRepository(session)
    promo = repo.add(
        PromotionCreate(restaurant_id=r.id, name="cat promo", type="percent", scope="category")
    )
    repo.set_categories(promo.id, [c1.id])
    assert repo.get(promo.id).category_ids == [c1.id]


@requires_db
def test_list_active_excludes_soft_deleted(session):
    r = _restaurant(session, "promo3")
    repo = SqlAlchemyPromotionRepository(session)
    keep = repo.add(PromotionCreate(restaurant_id=r.id, name="keep", type="percent", scope="order"))
    gone = repo.add(PromotionCreate(restaurant_id=r.id, name="gone", type="percent", scope="order"))
    repo.soft_delete(gone.id)
    page = repo.list_active(r.id, PaginationParams(limit=10))
    ids = [p.id for p in page.items]
    assert keep.id in ids
    assert gone.id not in ids


@requires_db
def test_list_active_bounded_query_count(session, engine):
    from sqlalchemy import event

    r = _restaurant(session, "promo-query-count")
    menu = SqlAlchemyMenuRepository(session)
    cat = menu.add_category(CategoryCreate(restaurant_id=r.id, name="Cat"))
    product = menu.add_product(
        ProductCreate(
            restaurant_id=r.id,
            name="P",
            price_cents=1000,
            category_ids=[cat.id],
        )
    )
    repo = SqlAlchemyPromotionRepository(session)
    for index in range(10):
        repo.add(
            PromotionCreate(
                restaurant_id=r.id,
                name=f"Promo {index}",
                type="percent",
                scope="product",
                percent=10,
                product_ids=[product.id],
                category_ids=[cat.id],
            )
        )

    query_count = {"n": 0}

    def before_cursor_execute(
        conn, cursor, statement, parameters, context, executemany
    ) -> None:
        query_count["n"] += 1

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        page = repo.list_active(r.id, PaginationParams(limit=20))
        assert len(page.items) == 10
        assert all(product.id in promo.product_ids for promo in page.items)
        assert query_count["n"] <= 8
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)
