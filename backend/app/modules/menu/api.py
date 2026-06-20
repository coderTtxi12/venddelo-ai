import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from pydantic import BaseModel

from app.api.cache_helpers import invalidate_restaurant_menu_cache
from app.api.deps import pagination_params, require_owned_restaurant
from app.core.exceptions import ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.infra.storage.factory import build_storage
from app.modules.menu.schemas import (
    AssetUploadDTO,
    CategoryCreate,
    CategoryDTO,
    CategoryUpdate,
    CategoryProductOrderUpdate,
    OptionGroupCreate,
    OptionGroupDTO,
    OptionGroupUpdate,
    OptionItemCreate,
    OptionItemDTO,
    OptionItemUpdate,
    ProductCreate,
    ProductDTO,
    ProductUpdate,
)
from app.modules.menu.service import MenuService
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["menu"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> MenuService:
    return MenuService(uow.menu)


class ApprovalBody(BaseModel):
    status: str


MAX_ASSET_BYTES = 2 * 1024 * 1024
ALLOWED_ASSET_FOLDERS = frozenset({"categories", "products", "logo", "cover"})


@router.post(
    "/restaurants/{restaurant_id}/assets",
    response_model=AssetUploadDTO,
    status_code=status.HTTP_201_CREATED,
)
def upload_restaurant_asset(
    folder: str = Query(...),
    file: UploadFile = File(...),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
) -> AssetUploadDTO:
    if folder not in ALLOWED_ASSET_FOLDERS:
        raise ValidationError(
            f"folder must be one of: {', '.join(sorted(ALLOWED_ASSET_FOLDERS))}"
        )
    content = file.file.read()
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise ValidationError("Only image uploads are allowed")
    if len(content) > MAX_ASSET_BYTES:
        raise ValidationError("Image exceeds 2 MB limit")
    ext = content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"
    path = f"restaurants/{restaurant.id}/{folder}/{uuid.uuid4()}.{ext}"
    stored = build_storage().upload(path, content, content_type)
    return AssetUploadDTO(path=stored.path, public_url=stored.public_url)


# Categories
@router.post(
    "/restaurants/{restaurant_id}/categories",
    response_model=CategoryDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    data: CategoryCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> CategoryDTO:
    dto = service.create_category(data.model_copy(update={"restaurant_id": restaurant.id}))
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.get("/restaurants/{restaurant_id}/categories", response_model=CursorPage[CategoryDTO])
def list_categories(
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
) -> CursorPage[CategoryDTO]:
    return service.list_categories(restaurant.id, params)


@router.patch(
    "/restaurants/{restaurant_id}/categories/{category_id}",
    response_model=CategoryDTO,
)
def update_category(
    category_id: uuid.UUID,
    data: CategoryUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> CategoryDTO:
    dto = service.update_category(restaurant.id, category_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.delete(
    "/restaurants/{restaurant_id}/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    category_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.delete_category(restaurant.id, category_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


@router.put(
    "/restaurants/{restaurant_id}/categories/{category_id}/products/order",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reorder_category_products(
    category_id: uuid.UUID,
    data: CategoryProductOrderUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.set_category_product_order(restaurant.id, category_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


# Products
@router.post(
    "/restaurants/{restaurant_id}/products",
    response_model=ProductDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    data: ProductCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> ProductDTO:
    dto = service.create_product(restaurant.id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.get("/restaurants/{restaurant_id}/products", response_model=CursorPage[ProductDTO])
def list_products(
    params: PaginationParams = Depends(pagination_params),
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
) -> CursorPage[ProductDTO]:
    return service.list_products(restaurant.id, params)


@router.get("/restaurants/{restaurant_id}/products/{product_id}", response_model=ProductDTO)
def get_product(
    product_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
) -> ProductDTO:
    return service.get_product(restaurant.id, product_id)


@router.patch(
    "/restaurants/{restaurant_id}/products/{product_id}",
    response_model=ProductDTO,
)
def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> ProductDTO:
    dto = service.update_product(restaurant.id, product_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.delete(
    "/restaurants/{restaurant_id}/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    product_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.delete_product(restaurant.id, product_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


@router.post(
    "/restaurants/{restaurant_id}/products/{product_id}/approval",
    response_model=ProductDTO,
)
def set_product_approval(
    product_id: uuid.UUID,
    body: ApprovalBody,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> ProductDTO:
    dto = service.set_approval(restaurant.id, product_id, body.status)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.post(
    "/restaurants/{restaurant_id}/products/{product_id}/publish",
    response_model=ProductDTO,
)
def publish_product(
    product_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> ProductDTO:
    dto = service.publish(restaurant.id, product_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


# Option groups
@router.post(
    "/restaurants/{restaurant_id}/products/{product_id}/option-groups",
    response_model=OptionGroupDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_option_group(
    product_id: uuid.UUID,
    data: OptionGroupCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> OptionGroupDTO:
    dto = service.add_option_group(restaurant.id, product_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.patch(
    "/restaurants/{restaurant_id}/products/{product_id}/option-groups/{group_id}",
    response_model=OptionGroupDTO,
)
def update_option_group(
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    data: OptionGroupUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> OptionGroupDTO:
    dto = service.update_option_group(restaurant.id, product_id, group_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.delete(
    "/restaurants/{restaurant_id}/products/{product_id}/option-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_option_group(
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.delete_option_group(restaurant.id, product_id, group_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)


@router.post(
    "/restaurants/{restaurant_id}/products/{product_id}/option-groups/{group_id}/items",
    response_model=OptionItemDTO,
    status_code=status.HTTP_201_CREATED,
)
def create_option_item(
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    data: OptionItemCreate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> OptionItemDTO:
    dto = service.add_option_item(restaurant.id, product_id, group_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.patch(
    "/restaurants/{restaurant_id}/products/{product_id}/option-groups/{group_id}/items/{item_id}",
    response_model=OptionItemDTO,
)
def update_option_item(
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    item_id: uuid.UUID,
    data: OptionItemUpdate,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> OptionItemDTO:
    dto = service.update_option_item(restaurant.id, product_id, group_id, item_id, data)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
    return dto


@router.delete(
    "/restaurants/{restaurant_id}/products/{product_id}/option-groups/{group_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_option_item(
    product_id: uuid.UUID,
    group_id: uuid.UUID,
    item_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MenuService = Depends(_service),
    uow: SqlAlchemyUnitOfWork = Depends(get_uow),
) -> None:
    service.delete_option_item(restaurant.id, product_id, group_id, item_id)
    invalidate_restaurant_menu_cache(uow, restaurant.id)
