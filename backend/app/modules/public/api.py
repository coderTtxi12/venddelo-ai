from fastapi import APIRouter, Depends, Header, Query, status

from app.core.exceptions import NotFoundError
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.ai.openai_gateway import build_ai_gateway
from app.infra.cache.menu_cache import MenuCacheService
from app.infra.cache.translated_menu import TranslatedMenuService
from app.infra.redis.factory import build_cache
from app.modules.menu.schemas import FullMenuDTO
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderDTO, PublicOrderInput
from app.modules.orders.service import OrderService
from app.modules.public.schemas import PublicRestaurantDTO
from app.core.pagination import PaginationParams
from app.modules.promotions.schemas import PromotionDTO
from app.modules.promotions.service import PromotionService
from app.modules.restaurants.schemas import ScheduleDTO
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


def _promotion_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> PromotionService:
    return PromotionService(uow.promotions)


def _public_restaurant(uow: SqlAlchemyUnitOfWork, subdomain: str):
    restaurant = uow.restaurants.get_by_subdomain(subdomain)
    if restaurant is None:
        raise NotFoundError("Restaurant not found")
    return restaurant


def _to_public_restaurant_dto(restaurant) -> PublicRestaurantDTO:
    return PublicRestaurantDTO(
        name=restaurant.name,
        description=restaurant.description,
        subdomain=restaurant.subdomain,
        logo_path=restaurant.logo_path,
        cover_path=restaurant.cover_path,
        address=restaurant.address,
        latitude=restaurant.latitude,
        longitude=restaurant.longitude,
        place_id=restaurant.place_id,
        takeout_enabled=restaurant.takeout_enabled,
        delivery_enabled=restaurant.delivery_enabled,
        color_palette=restaurant.color_palette,
        digital_menu_theme_id=restaurant.digital_menu_theme_id,
        whatsapp_phone=restaurant.whatsapp_phone,
        original_language=restaurant.original_language,
    )


@router.get("/restaurants/{subdomain}", response_model=PublicRestaurantDTO)
def get_public_restaurant(
    subdomain: str,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> PublicRestaurantDTO:
    restaurant = _public_restaurant(uow, subdomain)
    return _to_public_restaurant_dto(restaurant)


@router.get("/restaurants/{subdomain}/schedules", response_model=list[ScheduleDTO])
def get_public_restaurant_schedules(
    subdomain: str,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> list[ScheduleDTO]:
    restaurant = _public_restaurant(uow, subdomain)
    return list(uow.restaurants.list_schedules(restaurant.id))


@router.get("/restaurants/{subdomain}/promotions", response_model=list[PromotionDTO])
def get_public_restaurant_promotions(
    subdomain: str,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
    service: PromotionService = Depends(_promotion_service),
) -> list[PromotionDTO]:
    restaurant = _public_restaurant(uow, subdomain)
    page = service.list_active(restaurant.id, PaginationParams(limit=100))
    return page.items


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
