import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ProductStatus = Literal["active", "inactive", "draft"]


class CategoryCreate(BaseModel):
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    image_path: str | None = None
    sort_index: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_path: str | None = None
    sort_index: int | None = None
    display_layout: str | None = None
    is_active: bool | None = None


class CategoryDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    image_path: str | None = None
    sort_index: int
    display_layout: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OptionItemCreate(BaseModel):
    label: str
    price_delta_cents: int = 0
    sort_index: int = 0


class OptionItemUpdate(BaseModel):
    label: str | None = None
    price_delta_cents: int | None = None
    sort_index: int | None = None
    is_active: bool | None = None


class OptionItemDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    price_delta_cents: int
    sort_index: int
    is_active: bool


class OptionGroupCreate(BaseModel):
    title: str
    required: bool = False
    selection: str = "single"
    min_selections: int = 0
    max_selections: int | None = None
    sort_index: int = 0
    is_active: bool = True
    items: list[OptionItemCreate] = []


class OptionGroupUpdate(BaseModel):
    title: str | None = None
    required: bool | None = None
    selection: str | None = None
    min_selections: int | None = None
    max_selections: int | None = None
    sort_index: int | None = None
    is_active: bool | None = None


class OptionGroupDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    title: str
    required: bool
    selection: str
    min_selections: int
    max_selections: int | None
    sort_index: int
    is_active: bool
    items: list[OptionItemDTO] = []


class ProductCreate(BaseModel):
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    price_cents: int
    currency: str = "MXN"
    image_path: str | None = None
    status: ProductStatus = "draft"
    inventory_qty: int | None = Field(default=None, ge=0)
    shelf_life_days: int | None = Field(default=None, ge=1)
    expires_on: date | None = None
    batch_started_at: datetime | None = None
    category_ids: list[uuid.UUID] = []


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_cents: int | None = None
    currency: str | None = None
    image_path: str | None = None
    status: ProductStatus | None = None
    inventory_qty: int | None = Field(default=None, ge=0)
    shelf_life_days: int | None = Field(default=None, ge=1)
    expires_on: date | None = None
    batch_started_at: datetime | None = None
    category_ids: list[uuid.UUID] | None = None


class ProductPermanentBulkDelete(BaseModel):
    product_ids: list[uuid.UUID] = Field(min_length=1, max_length=20)


class ProductCountDTO(BaseModel):
    total: int


class ProductDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    price_cents: int
    currency: str
    image_path: str | None = None
    status: ProductStatus
    inventory_qty: int | None = None
    shelf_life_days: int | None = None
    expires_on: date | None = None
    batch_started_at: datetime | None = None
    show_low_stock: bool = False
    created_at: datetime
    updated_at: datetime
    category_ids: list[uuid.UUID] = []
    category_sort_indices: dict[str, int] = {}
    image_url: str | None = None
    option_groups: list[OptionGroupDTO] = []


class CategoryProductOrderUpdate(BaseModel):
    product_ids: list[uuid.UUID]


class ProductOptionGroupOrderUpdate(BaseModel):
    group_ids: list[uuid.UUID]


class OptionGroupItemOrderUpdate(BaseModel):
    item_ids: list[uuid.UUID]


class FullMenuDTO(BaseModel):
    restaurant_id: uuid.UUID
    categories: list[CategoryDTO]
    products: list[ProductDTO]


class AssetUploadDTO(BaseModel):
    path: str
    public_url: str
