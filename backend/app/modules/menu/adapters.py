from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, insert, select, tuple_, update
from sqlalchemy.orm import Session, selectinload

from app.core.pagination import (
    CursorPage,
    PaginationParams,
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.db.models.menu import Category, OptionGroup, OptionItem, Product, product_categories
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
    OptionItemCreate,
    OptionItemDTO,
    OptionItemUpdate,
    ProductCreate,
    ProductDTO,
    ProductUpdate,
)


def _category_sort_indices(session: Session, product_id: uuid.UUID) -> dict[str, int]:
    rows = session.execute(
        select(product_categories.c.category_id, product_categories.c.sort_index).where(
            product_categories.c.product_id == product_id
        )
    ).all()
    return {str(row.category_id): row.sort_index for row in rows}


def _category_sort_indices_batch(
    session: Session, product_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, int]]:
    if not product_ids:
        return {}
    rows = session.execute(
        select(
            product_categories.c.product_id,
            product_categories.c.category_id,
            product_categories.c.sort_index,
        ).where(product_categories.c.product_id.in_(product_ids))
    ).all()
    result: dict[uuid.UUID, dict[str, int]] = {product_id: {} for product_id in product_ids}
    for row in rows:
        result[row.product_id][str(row.category_id)] = row.sort_index
    return result


def _product_to_dto(
    obj: Product,
    session: Session | None = None,
    *,
    category_sort_indices: dict[str, int] | None = None,
) -> ProductDTO:
    dto = ProductDTO.model_validate(obj)
    dto.category_ids = [c.id for c in obj.categories]
    if category_sort_indices is not None:
        dto.category_sort_indices = category_sort_indices
    else:
        if session is None:
            raise ValueError("session is required when category_sort_indices is not provided")
        dto.category_sort_indices = _category_sort_indices(session, obj.id)
    dto.option_groups = [OptionGroupDTO.model_validate(g) for g in obj.option_groups]
    return dto


def _products_to_dtos(session: Session, products: list[Product]) -> list[ProductDTO]:
    sort_map = _category_sort_indices_batch(session, [product.id for product in products])
    return [
        _product_to_dto(product, category_sort_indices=sort_map.get(product.id, {}))
        for product in products
    ]


def _load_menu_products(
    session: Session,
    restaurant_id: uuid.UUID,
    *,
    published_only: bool,
) -> list[Product]:
    stmt = (
        select(Product)
        .where(Product.restaurant_id == restaurant_id)
        .options(
            selectinload(Product.categories),
            selectinload(Product.option_groups).selectinload(OptionGroup.items),
        )
        .order_by(Product.is_active.desc(), Product.created_at, Product.id)
    )
    if published_only:
        stmt = stmt.where(
            Product.is_published.is_(True),
            Product.approval_status == "approved",
        )
    return list(session.scalars(stmt))


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

    def _next_sort_index(self, category_id: uuid.UUID) -> int:
        current = self._session.execute(
            select(func.coalesce(func.max(product_categories.c.sort_index), -1)).where(
                product_categories.c.category_id == category_id
            )
        ).scalar_one()
        return int(current) + 1

    def _set_product_categories(
        self, product_id: uuid.UUID, category_ids: list[uuid.UUID]
    ) -> None:
        existing_rows = self._session.execute(
            select(product_categories.c.category_id, product_categories.c.sort_index).where(
                product_categories.c.product_id == product_id
            )
        ).all()
        preserved = {row.category_id: row.sort_index for row in existing_rows}

        self._session.execute(
            delete(product_categories).where(product_categories.c.product_id == product_id)
        )
        for category_id in category_ids:
            sort_index = preserved.get(category_id)
            if sort_index is None:
                sort_index = self._next_sort_index(category_id)
            self._session.execute(
                insert(product_categories).values(
                    product_id=product_id,
                    category_id=category_id,
                    sort_index=sort_index,
                )
            )

    def add_product(self, data: ProductCreate) -> ProductDTO:
        payload = data.model_dump(exclude={"category_ids"})
        obj = Product(**payload)
        self._session.add(obj)
        self._session.flush()
        self._set_product_categories(obj.id, data.category_ids)
        self._session.flush()
        self._session.refresh(obj)
        return _product_to_dto(obj, self._session)

    def get_product(self, id: uuid.UUID) -> ProductDTO | None:
        obj = self._session.get(Product, id)
        if obj is None or not obj.is_active:
            return None
        return _product_to_dto(obj, self._session)

    def get_product_by_id(self, id: uuid.UUID) -> ProductDTO | None:
        obj = self._session.get(Product, id)
        return _product_to_dto(obj, self._session) if obj else None

    def list_products(
        self,
        restaurant_id: uuid.UUID,
        params: PaginationParams,
        *,
        published_only: bool = False,
        category_id: uuid.UUID | None = None,
    ) -> CursorPage[ProductDTO]:
        stmt = (
            select(Product)
            .where(Product.restaurant_id == restaurant_id)
            .order_by(Product.created_at, Product.id)
            .limit(params.limit + 1)
        )
        if category_id is not None:
            stmt = stmt.join(
                product_categories,
                product_categories.c.product_id == Product.id,
            ).where(product_categories.c.category_id == category_id)
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
            items=[_product_to_dto(r, self._session) for r in rows],
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
            self._set_product_categories(obj.id, category_ids)
        self._session.flush()
        self._session.refresh(obj)
        return _product_to_dto(obj, self._session)

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
        products = _load_menu_products(
            self._session,
            restaurant_id,
            published_only=True,
        )
        return FullMenuDTO(
            restaurant_id=restaurant_id,
            categories=[CategoryDTO.model_validate(c) for c in categories],
            products=_products_to_dtos(self._session, products),
        )

    def get_preview_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO:
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
        products = _load_menu_products(
            self._session,
            restaurant_id,
            published_only=False,
        )
        return FullMenuDTO(
            restaurant_id=restaurant_id,
            categories=[CategoryDTO.model_validate(c) for c in categories],
            products=_products_to_dtos(self._session, products),
        )

    def set_category_product_order(
        self, category_id: uuid.UUID, product_ids: list[uuid.UUID]
    ) -> None:
        linked_ids = {
            row.product_id
            for row in self._session.execute(
                select(product_categories.c.product_id).where(
                    product_categories.c.category_id == category_id
                )
            ).all()
        }
        if set(product_ids) != linked_ids:
            raise ValueError("product_ids must match products linked to category")

        for index, product_id in enumerate(product_ids):
            self._session.execute(
                update(product_categories)
                .where(
                    product_categories.c.category_id == category_id,
                    product_categories.c.product_id == product_id,
                )
                .values(sort_index=index)
            )
        self._session.flush()
