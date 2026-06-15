from fastapi import APIRouter, Depends, Header, Query, status

from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.ai.openai_gateway import build_ai_gateway
from app.infra.cache.menu_cache import MenuCacheService
from app.infra.cache.translated_menu import TranslatedMenuService
from app.infra.redis.factory import build_cache
from app.modules.menu.schemas import FullMenuDTO
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderDTO, PublicOrderInput
from app.modules.orders.service import OrderService
from app.modules.translations.service import TranslationService

router = APIRouter(prefix="/public", tags=["public"])


def _menu_cache(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> MenuCacheService:
    return MenuCacheService(
        build_cache(),
        uow.restaurants,
        MenuService(uow.menu),
    )


def _translated_menu(
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
    menu_cache: MenuCacheService = Depends(_menu_cache),
) -> TranslatedMenuService:
    return TranslatedMenuService(
        build_cache(),
        uow.restaurants,
        menu_cache,
        TranslationService(uow.translations, build_ai_gateway()),
    )


def _order_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> OrderService:
    return OrderService(
        uow.orders,
        uow.restaurants,
        uow.menu,
        uow.idempotency,
    )


@router.get("/menu/{subdomain}", response_model=FullMenuDTO)
def get_public_menu(
    subdomain: str,
    locale: str = Query(default="default"),
    translated_menu: TranslatedMenuService = Depends(_translated_menu),
) -> FullMenuDTO:
    return translated_menu.get_public_menu(subdomain, locale)


@router.post(
    "/menu/{subdomain}/orders",
    response_model=OrderDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_public_order(
    subdomain: str,
    data: PublicOrderInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    service: OrderService = Depends(_order_service),
) -> OrderDTO:
    return service.create_public(subdomain, data, idempotency_key)
