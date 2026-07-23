from __future__ import annotations

import uuid

from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import CursorPage, PaginationParams
from app.modules.menu.repository import MenuRepository
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryDTO,
    CategoryUpdate,
    CategoryProductOrderUpdate,
    FullMenuDTO,
    OptionGroupCreate,
    OptionGroupDTO,
    OptionGroupUpdate,
    OptionGroupItemOrderUpdate,
    OptionItemCreate,
    OptionItemDTO,
    OptionItemUpdate,
    ProductCreate,
    ProductDTO,
    ProductUpdate,
    ProductOptionGroupOrderUpdate,
)


class MenuService:
    def __init__(self, repo: MenuRepository) -> None:
        self._repo = repo

    def _ensure_categories_in_restaurant(
        self, restaurant_id: uuid.UUID, category_ids: list[uuid.UUID]
    ) -> None:
        for cid in category_ids:
            cat = self._repo.get_category(cid)
            if cat is None or cat.restaurant_id != restaurant_id:
                raise ValidationError(f"Category {cid} not found in restaurant")

    def _validate_option_group(self, data: OptionGroupCreate | OptionGroupUpdate) -> None:
        selection = getattr(data, "selection", None)
        min_sel = getattr(data, "min_selections", None)
        max_sel = getattr(data, "max_selections", None)
        if selection is not None and selection not in {"single", "multi"}:
            raise ValidationError("selection must be single or multi")
        if min_sel is not None and max_sel is not None and min_sel > max_sel:
            raise ValidationError("min_selections cannot exceed max_selections")
        if selection == "single" and max_sel is not None and max_sel > 1:
            raise ValidationError("single selection allows max_selections of 1 at most")

    # Categories
    def create_category(self, data: CategoryCreate) -> CategoryDTO:
        return self._repo.add_category(data)

    def get_category(self, restaurant_id: uuid.UUID, category_id: uuid.UUID) -> CategoryDTO:
        cat = self._repo.get_category(category_id)
        if cat is None or cat.restaurant_id != restaurant_id:
            raise NotFoundError("Category not found")
        return cat

    def list_categories(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CategoryDTO]:
        return self._repo.list_categories(restaurant_id, params)

    def list_all_categories(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CategoryDTO]:
        return self._repo.list_all_categories(restaurant_id, params)

    def update_category(
        self, restaurant_id: uuid.UUID, category_id: uuid.UUID, data: CategoryUpdate
    ) -> CategoryDTO:
        cat = self._repo.get_category_by_id(category_id)
        if cat is None or cat.restaurant_id != restaurant_id:
            raise NotFoundError("Category not found")
        dto = self._repo.update_category(category_id, data)
        if dto is None:
            raise NotFoundError("Category not found")
        return dto

    def delete_category(self, restaurant_id: uuid.UUID, category_id: uuid.UUID) -> None:
        self.get_category(restaurant_id, category_id)
        if not self._repo.soft_delete_category(category_id):
            raise NotFoundError("Category not found")

    # Products
    def create_product(self, restaurant_id: uuid.UUID, data: ProductCreate) -> ProductDTO:
        if len(data.category_ids) < 1:
            raise ValidationError("Product must belong to at least one category")
        self._ensure_categories_in_restaurant(restaurant_id, data.category_ids)
        payload = data.model_copy(update={"restaurant_id": restaurant_id})
        return self._repo.add_product(payload)

    def get_product(self, restaurant_id: uuid.UUID, product_id: uuid.UUID) -> ProductDTO:
        prod = self._repo.get_product(product_id)
        if prod is None or prod.restaurant_id != restaurant_id:
            raise NotFoundError("Product not found")
        return prod

    def get_product_by_id(self, restaurant_id: uuid.UUID, product_id: uuid.UUID) -> ProductDTO:
        """Return a product even when inactive (for owner/admin flows)."""
        prod = self._repo.get_product_by_id(product_id)
        if prod is None or prod.restaurant_id != restaurant_id:
            raise NotFoundError("Product not found")
        return prod

    def list_products(
        self, restaurant_id: uuid.UUID, params: PaginationParams, *, include_options: bool = True
    ) -> CursorPage[ProductDTO]:
        return self._repo.list_products(
            restaurant_id,
            params,
            include_options=include_options,
        )

    def count_products(self, restaurant_id: uuid.UUID) -> int:
        return self._repo.count_products(restaurant_id)

    def list_products_page(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        category_id: uuid.UUID | None = None,
        include_options: bool = True,
    ) -> CursorPage[ProductDTO]:
        if category_id is not None:
            self.get_category(restaurant_id, category_id)
        return self._repo.list_products(
            restaurant_id,
            params,
            category_id=category_id,
            include_options=include_options,
        )

    def update_product(
        self, restaurant_id: uuid.UUID, product_id: uuid.UUID, data: ProductUpdate
    ) -> ProductDTO:
        prod = self._repo.get_product_by_id(product_id)
        if prod is None or prod.restaurant_id != restaurant_id:
            raise NotFoundError("Product not found")
        if data.category_ids is not None:
            if len(data.category_ids) < 1:
                raise ValidationError("Product must belong to at least one category")
            self._ensure_categories_in_restaurant(restaurant_id, data.category_ids)
        dto = self._repo.update_product(product_id, data)
        if dto is None:
            raise NotFoundError("Product not found")
        return dto

    def delete_product(self, restaurant_id: uuid.UUID, product_id: uuid.UUID) -> None:
        prod = self._repo.get_product_by_id(product_id)
        if prod is None or prod.restaurant_id != restaurant_id:
            raise NotFoundError("Product not found")
        if not self._repo.soft_delete_product(product_id):
            raise NotFoundError("Product not found")

    def set_category_product_order(
        self,
        restaurant_id: uuid.UUID,
        category_id: uuid.UUID,
        data: CategoryProductOrderUpdate,
    ) -> None:
        cat = self._repo.get_category_by_id(category_id)
        if cat is None or cat.restaurant_id != restaurant_id:
            raise NotFoundError("Category not found")
        if len(data.product_ids) < 1:
            raise ValidationError("At least one product is required")
        try:
            self._repo.set_category_product_order(category_id, data.product_ids)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

    def set_product_option_group_order(
        self,
        restaurant_id: uuid.UUID,
        product_id: uuid.UUID,
        data: ProductOptionGroupOrderUpdate,
    ) -> None:
        self.get_product(restaurant_id, product_id)
        if len(data.group_ids) < 1:
            raise ValidationError("At least one option group is required")
        try:
            self._repo.set_product_option_group_order(product_id, data.group_ids)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

    def set_option_group_item_order(
        self,
        restaurant_id: uuid.UUID,
        product_id: uuid.UUID,
        group_id: uuid.UUID,
        data: OptionGroupItemOrderUpdate,
    ) -> None:
        product = self.get_product(restaurant_id, product_id)
        if not any(group.id == group_id for group in product.option_groups):
            raise NotFoundError("Option group not found")
        if len(data.item_ids) < 1:
            raise ValidationError("At least one option item is required")
        try:
            self._repo.set_option_group_item_order(group_id, data.item_ids)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc


    # Option groups
    def add_option_group(
        self, restaurant_id: uuid.UUID, product_id: uuid.UUID, data: OptionGroupCreate
    ) -> OptionGroupDTO:
        self.get_product(restaurant_id, product_id)
        self._validate_option_group(data)
        return self._repo.add_option_group(product_id, data)

    def update_option_group(
        self,
        restaurant_id: uuid.UUID,
        product_id: uuid.UUID,
        group_id: uuid.UUID,
        data: OptionGroupUpdate,
    ) -> OptionGroupDTO:
        prod = self.get_product(restaurant_id, product_id)
        if not any(g.id == group_id for g in prod.option_groups):
            raise NotFoundError("Option group not found")
        self._validate_option_group(data)
        dto = self._repo.update_option_group(group_id, data)
        if dto is None:
            raise NotFoundError("Option group not found")
        return dto

    def delete_option_group(
        self, restaurant_id: uuid.UUID, product_id: uuid.UUID, group_id: uuid.UUID
    ) -> None:
        prod = self.get_product(restaurant_id, product_id)
        if not any(g.id == group_id for g in prod.option_groups):
            raise NotFoundError("Option group not found")
        if not self._repo.delete_option_group(group_id):
            raise NotFoundError("Option group not found")

    def add_option_item(
        self,
        restaurant_id: uuid.UUID,
        product_id: uuid.UUID,
        group_id: uuid.UUID,
        data: OptionItemCreate,
    ) -> OptionItemDTO:
        self.get_product(restaurant_id, product_id)
        return self._repo.add_option_item(group_id, data)

    def delete_option_item(
        self,
        restaurant_id: uuid.UUID,
        product_id: uuid.UUID,
        group_id: uuid.UUID,
        item_id: uuid.UUID,
    ) -> None:
        prod = self.get_product(restaurant_id, product_id)
        group = next((g for g in prod.option_groups if g.id == group_id), None)
        if group is None:
            raise NotFoundError("Option group not found")
        if not any(item.id == item_id for item in group.items):
            raise NotFoundError("Option item not found")
        if not self._repo.delete_option_item(item_id):
            raise NotFoundError("Option item not found")

    def update_option_item(
        self,
        restaurant_id: uuid.UUID,
        product_id: uuid.UUID,
        group_id: uuid.UUID,
        item_id: uuid.UUID,
        data: OptionItemUpdate,
    ) -> OptionItemDTO:
        prod = self.get_product(restaurant_id, product_id)
        group = next((g for g in prod.option_groups if g.id == group_id), None)
        if group is None:
            raise NotFoundError("Option group not found")
        if not any(item.id == item_id for item in group.items):
            raise NotFoundError("Option item not found")
        dto = self._repo.update_option_item(item_id, data)
        if dto is None:
            raise NotFoundError("Option item not found")
        return dto

    def get_full_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO:
        return self._repo.get_full_menu(restaurant_id)

    def get_preview_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO:
        return self._repo.get_preview_menu(restaurant_id)
