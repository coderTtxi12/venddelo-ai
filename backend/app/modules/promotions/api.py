import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.api.deps import pagination_params, require_owned_restaurant
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.menu.service import MenuService
from app.modules.promotions.option_item_sync import (
    is_nxm_bundle_promo,
    sync_option_items_for_product_change,
)
from app.modules.promotions.schemas import PromotionCreate, PromotionDTO, PromotionUpdate
from app.modules.promotions.service import PromotionService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["promotions"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> PromotionService:
    return PromotionService(uow.promotions)


class IdListBody(BaseModel):
    ids: list[uuid.UUID]


@router.post(
    "/restaurants/{restaurant_id}/promotions",
    response_model=PromotionDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_promotion(
    data: PromotionCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> PromotionDTO:
    dto = service.create(restaurant.id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.get(
    "/restaurants/{restaurant_id}/promotions",
    response_model=CursorPage[PromotionDTO],
)
def list_promotions(
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
) -> CursorPage[PromotionDTO]:
    return service.list_for_admin(restaurant.id, params, timezone=restaurant.timezone)


@router.put(
    "/restaurants/{restaurant_id}/promotions/{promotion_id}/option-items",
    status_code=status.HTTP_204_NO_CONTENT,
)
def set_promotion_option_items(
    promotion_id: uuid.UUID,
    body: IdListBody,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.set_option_items(restaurant.id, promotion_id, body.ids)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


@router.patch(
    "/restaurants/{restaurant_id}/promotions/{promotion_id}",
    response_model=PromotionDTO,
)
def update_promotion(
    promotion_id: uuid.UUID,
    data: PromotionUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> PromotionDTO:
    dto = service.update(restaurant.id, promotion_id, data, timezone=restaurant.timezone)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.delete(
    "/restaurants/{restaurant_id}/promotions/{promotion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_promotion(
    promotion_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.delete(restaurant.id, promotion_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


@router.put(
    "/restaurants/{restaurant_id}/promotions/{promotion_id}/products",
    status_code=status.HTTP_204_NO_CONTENT,
)
def set_promotion_products(
    promotion_id: uuid.UUID,
    body: IdListBody,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    promo = service.get(restaurant.id, promotion_id)
    previous_product_ids = list(promo.product_ids)
    service.set_products(restaurant.id, promotion_id, body.ids)
    if is_nxm_bundle_promo(promo) and promo.option_item_ids:
        menu = MenuService(uow.menu)
        synced = sync_option_items_for_product_change(
            menu,
            restaurant.id,
            previous_product_ids=previous_product_ids,
            new_product_ids=body.ids,
            current_option_item_ids=promo.option_item_ids,
        )
        if synced != promo.option_item_ids:
            service.set_option_items(restaurant.id, promotion_id, synced)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


@router.put(
    "/restaurants/{restaurant_id}/promotions/{promotion_id}/categories",
    status_code=status.HTTP_204_NO_CONTENT,
)
def set_promotion_categories(
    promotion_id: uuid.UUID,
    body: IdListBody,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: PromotionService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.set_categories(restaurant.id, promotion_id, body.ids)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
