from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, Query, status

from app.core.exceptions import NotFoundError
from app.core.pagination import PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.ai.openai_gateway import build_ai_gateway
from app.infra.cache.menu_cache import MenuCacheService
from app.infra.cache.translated_menu import TranslatedMenuService
from app.infra.redis.factory import build_cache
from app.modules.menu.schemas import FullMenuDTO
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderDTO, PublicOrderInput
from app.modules.orders.service import OrderService
from app.modules.promotions.effective import resolve_timezone
from app.modules.promotions.pricing import CartLineInput, price_cart
from app.modules.promotions.schemas import PromotionDTO
from app.modules.promotions.service import PromotionService
from app.modules.public.schemas import (
    CartQuoteDTO,
    CartQuoteInput,
    CartQuoteLineDTO,
    PublicPromotionsContextDTO,
    PublicRestaurantDTO,
)
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
        uow.promotions,
    )


def _promotion_service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> PromotionService:
    return PromotionService(uow.promotions)


def _public_restaurant(uow: SqlAlchemyUnitOfWork, subdomain: str):
    restaurant = uow.restaurants.get_by_subdomain(subdomain)
    if restaurant is None:
        raise NotFoundError("Restaurant not found")
    return restaurant


def _to_public_restaurant_dto(restaurant) -> PublicRestaurantDTO:
    now = datetime.now(UTC)
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
        timezone=restaurant.timezone,
        server_now=now,
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


@router.get("/restaurants/{subdomain}/promotions", response_model=PublicPromotionsContextDTO)
def get_public_restaurant_promotions(
    subdomain: str,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
    service: PromotionService = Depends(_promotion_service),
) -> PublicPromotionsContextDTO:
    restaurant = _public_restaurant(uow, subdomain)
    tz = resolve_timezone(restaurant.timezone)
    now = datetime.now(UTC)
    items = service.list_effective_public(
        restaurant.id,
        PaginationParams(limit=100),
        timezone=restaurant.timezone,
    )
    local_now = now.astimezone(tz)
    return PublicPromotionsContextDTO(
        server_now=now,
        timezone=restaurant.timezone,
        local_now=local_now,
        items=items,
    )


@router.post("/restaurants/{subdomain}/cart/quote", response_model=CartQuoteDTO)
def quote_public_cart(
    subdomain: str,
    data: CartQuoteInput,
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
    promo_service: PromotionService = Depends(_promotion_service),
) -> CartQuoteDTO:
    restaurant = _public_restaurant(uow, subdomain)
    tz = resolve_timezone(restaurant.timezone)
    now = datetime.now(UTC)

    promotions = promo_service.list_effective_public(
        restaurant.id,
        PaginationParams(limit=100),
        timezone=restaurant.timezone,
    )

    products_by_id = {}
    for line in data.items:
        product = uow.menu.get_product(line.product_id)
        if product is None or product.restaurant_id != restaurant.id:
            raise NotFoundError(f"Product {line.product_id} not found")
        if not product.is_published or product.approval_status != "approved":
            raise NotFoundError(f"Product {line.product_id} not found")
        products_by_id[product.id] = product

    quote = price_cart(
        lines=[
            CartLineInput(
                product_id=line.product_id,
                quantity=line.quantity,
                selected_options=line.selected_options,
            )
            for line in data.items
        ],
        products_by_id=products_by_id,
        promotions=promotions,
        now_utc=now,
        tz=tz,
    )

    return CartQuoteDTO(
        server_now=now,
        timezone=restaurant.timezone,
        lines=[
            CartQuoteLineDTO(
                product_id=pl.product_id,
                quantity=pl.quantity,
                unit_base_cents=pl.unit_base_cents,
                options_cents=pl.options_cents,
                discount_cents=pl.discount_cents,
                line_total_cents=pl.line_total_cents,
                badge=pl.badge,
                applied_promotion_id=pl.applied_promotion_id,
                promo_warnings=pl.promo_warnings or [],
            )
            for pl in quote.lines
        ],
        subtotal_before_discount_cents=quote.subtotal_before_discount_cents,
        order_discount_cents=quote.order_discount_cents,
        total_cents=quote.total_cents,
        applied_order_promotion_id=quote.applied_order_promotion_id,
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
