from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from app.core.pagination import CursorPage, PaginationParams
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryDTO,
    CategoryUpdate,
    CategoryProductOrderUpdate,
    FullMenuDTO,
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


class MenuRepository(ABC):
    # Categories
    @abstractmethod
    def add_category(self, data: CategoryCreate) -> CategoryDTO: ...

    @abstractmethod
    def get_category(self, id: uuid.UUID) -> CategoryDTO | None: ...

    @abstractmethod
    def get_category_by_id(self, id: uuid.UUID) -> CategoryDTO | None: ...

    @abstractmethod
    def list_categories(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CategoryDTO]: ...

    @abstractmethod
    def update_category(self, id: uuid.UUID, data: CategoryUpdate) -> CategoryDTO | None: ...

    @abstractmethod
    def soft_delete_category(self, id: uuid.UUID) -> bool: ...

    # Products
    @abstractmethod
    def add_product(self, data: ProductCreate) -> ProductDTO: ...

    @abstractmethod
    def get_product(self, id: uuid.UUID) -> ProductDTO | None: ...

    @abstractmethod
    def get_product_by_id(self, id: uuid.UUID) -> ProductDTO | None: ...

    @abstractmethod
    def list_products(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        published_only: bool = False,
    ) -> CursorPage[ProductDTO]: ...

    @abstractmethod
    def update_product(self, id: uuid.UUID, data: ProductUpdate) -> ProductDTO | None: ...

    @abstractmethod
    def set_category_product_order(
        self, category_id: uuid.UUID, product_ids: list[uuid.UUID]
    ) -> None: ...

    @abstractmethod
    def soft_delete_product(self, id: uuid.UUID) -> bool: ...

    # Options
    @abstractmethod
    def add_option_group(
        self, product_id: uuid.UUID, data: OptionGroupCreate
    ) -> OptionGroupDTO: ...

    @abstractmethod
    def update_option_group(
        self, id: uuid.UUID, data: OptionGroupUpdate
    ) -> OptionGroupDTO | None: ...

    @abstractmethod
    def delete_option_group(self, id: uuid.UUID) -> bool: ...

    @abstractmethod
    def add_option_item(
        self, option_group_id: uuid.UUID, data: OptionItemCreate
    ) -> OptionItemDTO: ...

    @abstractmethod
    def delete_option_item(self, id: uuid.UUID) -> bool: ...

    @abstractmethod
    def update_option_item(self, id: uuid.UUID, data: OptionItemUpdate) -> OptionItemDTO | None: ...

    # Public menu
    @abstractmethod
    def get_full_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO: ...

    def get_preview_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO: ...
