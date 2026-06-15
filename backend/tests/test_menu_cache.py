import fakeredis

from app.infra.cache.menu_cache import MenuCacheService, menu_cache_key
from app.infra.redis.cache import RedisCacheAdapter
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.menu.schemas import FullMenuDTO
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
