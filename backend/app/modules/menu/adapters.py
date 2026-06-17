from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.menu import Category, OptionGroup, OptionItem, Product
from app.modules.menu.repository import MenuRepository
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryDTO,
    CategoryUpdate,
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


def _product_to_dto(obj: Product) -> ProductDTO:
    dto = ProductDTO.model_validate(obj)
    dto.category_ids = [c.id for c in obj.categories]
    dto.option_groups = [OptionGroupDTO.model_validate(g) for g in obj.option_groups]
    return dto


class SqlAlchemyMenuRepository(MenuRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    # Categories
    def add_category(self, data: CategoryCreate) -> CategoryDTO:
        obj = Category(**data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return CategoryDTO.model_validate(obj)

    def get_category(self, id: uuid.UUID) -> CategoryDTO | None:
        obj = self._session.get(Category, id)
        if obj is None or not obj.is_active:
            return None
        return CategoryDTO.model_validate(obj)

    def get_category_by_id(self, id: uuid.UUID) -> CategoryDTO | None:
        obj = self._session.get(Category, id)
        return CategoryDTO.model_validate(obj) if obj else None

    def list_categories(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CategoryDTO]:
        stmt = (
            select(Category)
            .where(Category.restaurant_id == restaurant_id, Category.is_active.is_(True))
            .order_by(Category.sort_index, Category.created_at, Category.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Category.created_at, Category.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[CategoryDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update_category(self, id: uuid.UUID, data: CategoryUpdate) -> CategoryDTO | None:
        obj = self._session.get(Category, id)
        if obj is None:
            return None
        updates = data.model_dump(exclude_unset=True)
        if updates.get("is_active") is True:
            obj.deleted_at = None
        elif updates.get("is_active") is False:
            obj.deleted_at = datetime.now(UTC)
        for field, value in updates.items():
            setattr(obj, field, value)
        self._session.flush()
        return CategoryDTO.model_validate(obj)

    def soft_delete_category(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Category, id)
        if obj is None or not obj.is_active:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    # Products
    def _load_categories(self, ids: list[uuid.UUID]) -> list[Category]:
        if not ids:
            return []
        return list(self._session.scalars(select(Category).where(Category.id.in_(ids))))

    def add_product(self, data: ProductCreate) -> ProductDTO:
        payload = data.model_dump(exclude={"category_ids"})
        obj = Product(**payload)
        obj.categories = self._load_categories(data.category_ids)
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return _product_to_dto(obj)

    def get_product(self, id: uuid.UUID) -> ProductDTO | None:
        obj = self._session.get(Product, id)
        if obj is None or not obj.is_active:
            return None
        return _product_to_dto(obj)

    def get_product_by_id(self, id: uuid.UUID) -> ProductDTO | None:
        obj = self._session.get(Product, id)
        return _product_to_dto(obj) if obj else None

    def list_products(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        published_only: bool = False,
    ) -> CursorPage[ProductDTO]:
        stmt = (
            select(Product)
            .where(Product.restaurant_id == restaurant_id)
            .order_by(Product.created_at, Product.id)
            .limit(params.limit + 1)
        )
        if published_only:
            stmt = stmt.where(
                Product.is_published.is_(True),
                Product.approval_status == "approved",
            )
        if params.cursor:
            created_at, last_id = decode_keyset_cursor(params.cursor)
            stmt = stmt.where(tuple_(Product.created_at, Product.id) > (created_at, last_id))
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = encode_keyset_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        return CursorPage(
            items=[_product_to_dto(r) for r in rows],
            next_cursor=next_cursor,
            has_more=has_more,
        )

    def update_product(self, id: uuid.UUID, data: ProductUpdate) -> ProductDTO | None:
        obj = self._session.get(Product, id)
        if obj is None:
            return None
        values = data.model_dump(exclude_unset=True)
        if values.get("is_active") is True:
            obj.deleted_at = None
        elif values.get("is_active") is False:
            obj.deleted_at = datetime.now(UTC)
        category_ids = values.pop("category_ids", None)
        for field, value in values.items():
            setattr(obj, field, value)
        if category_ids is not None:
            obj.categories = self._load_categories(category_ids)
        self._session.flush()
        self._session.refresh(obj)
        return _product_to_dto(obj)

    def soft_delete_product(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Product, id)
        if obj is None or not obj.is_active:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    # Options
    def add_option_group(self, product_id: uuid.UUID, data: OptionGroupCreate) -> OptionGroupDTO:
        payload = data.model_dump(exclude={"items"})
        group = OptionGroup(product_id=product_id, **payload)
        group.items = [OptionItem(**i.model_dump()) for i in data.items]
        self._session.add(group)
        self._session.flush()
        self._session.refresh(group)
        return OptionGroupDTO.model_validate(group)

    def update_option_group(self, id: uuid.UUID, data: OptionGroupUpdate) -> OptionGroupDTO | None:
        obj = self._session.get(OptionGroup, id)
        if obj is None:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        self._session.flush()
        return OptionGroupDTO.model_validate(obj)

    def delete_option_group(self, id: uuid.UUID) -> bool:
        obj = self._session.get(OptionGroup, id)
        if obj is None:
            return False
        self._session.delete(obj)
        self._session.flush()
        return True

    def add_option_item(self, option_group_id: uuid.UUID, data: OptionItemCreate) -> OptionItemDTO:
        obj = OptionItem(option_group_id=option_group_id, **data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return OptionItemDTO.model_validate(obj)

    def delete_option_item(self, id: uuid.UUID) -> bool:
        obj = self._session.get(OptionItem, id)
        if obj is None:
            return False
        self._session.delete(obj)
        self._session.flush()
        return True

    def update_option_item(self, id: uuid.UUID, data: OptionItemUpdate) -> OptionItemDTO | None:
        obj = self._session.get(OptionItem, id)
        if obj is None:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        self._session.flush()
        self._session.refresh(obj)
        return OptionItemDTO.model_validate(obj)

    # Public menu
    def get_full_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO:
        categories = list(
            self._session.scalars(
                select(Category)
                .where(
                    Category.restaurant_id == restaurant_id,
                    Category.is_active.is_(True),
                )
                .order_by(Category.sort_index, Category.created_at)
            )
        )
        products = list(
            self._session.scalars(
                select(Product)
                .where(
                    Product.restaurant_id == restaurant_id,
                    Product.is_active.is_(True),
                    Product.is_published.is_(True),
                    Product.approval_status == "approved",
                )
                .order_by(Product.created_at, Product.id)
            )
        )
        return FullMenuDTO(
            restaurant_id=restaurant_id,
            categories=[CategoryDTO.model_validate(c) for c in categories],
            products=[_product_to_dto(p) for p in products],
        )
