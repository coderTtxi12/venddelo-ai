import fakeredis

from app.infra.cache.menu_cache import MenuCacheService, menu_cache_key
from app.infra.redis.cache import RedisCacheAdapter
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import CategoryCreate, FullMenuDTO, ProductCreate, ProductUpdate
from app.modules.menu.service import MenuService
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_menu_cache_hit(session):
    client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(client)
    repo = SqlAlchemyRestaurantRepository(session)
    r = repo.add(
        RestaurantCreate(name="C", subdomain="cached", status="published"),
        owner_id=None,
    )
    menu_svc = MenuService(SqlAlchemyMenuRepository(session))
    svc = MenuCacheService(cache, repo, menu_svc, ttl_seconds=300)

    menu = FullMenuDTO(restaurant_id=r.id, categories=[], products=[])
    cache.set(menu_cache_key("cached", "default"), menu.model_dump_json(), 300)

    got = svc.get_public_menu("cached")
    assert got.restaurant_id == r.id


@requires_db
def test_menu_cache_excludes_draft_products_for_unpublished_restaurant(session):
    client = fakeredis.FakeRedis(decode_responses=True)
    cache = RedisCacheAdapter(client)
    restaurants = SqlAlchemyRestaurantRepository(session)
    menu_repo = SqlAlchemyMenuRepository(session)
    restaurant = restaurants.add(
        RestaurantCreate(name="Draft Resto", subdomain="draft-menu", status="draft"),
        owner_id=None,
    )
    category = menu_repo.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers"),
    )
    menu_repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Secret Draft",
            price_cents=1000,
            category_ids=[category.id],
        )
    )
    menu_repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="On Menu",
            price_cents=1200,
            status="active",
            category_ids=[category.id],
        )
    )
    inactive = menu_repo.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Inactive",
            price_cents=900,
            status="active",
            category_ids=[category.id],
        )
    )
    menu_repo.update_product(inactive.id, ProductUpdate(status="inactive"))

    menu_svc = MenuService(menu_repo)
    svc = MenuCacheService(cache, restaurants, menu_svc, ttl_seconds=300)

    got = svc.get_public_menu("draft-menu")
    names = [product.name for product in got.products]

    assert names == ["On Menu", "Inactive"]
