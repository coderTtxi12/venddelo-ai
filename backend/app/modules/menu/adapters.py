from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import case, delete, func, insert, select, tuple_, update
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


def _resolve_active_first_entity_order(
    *,
    linked_rows: list[tuple[uuid.UUID, int, bool]],
    provided_ids: list[uuid.UUID],
    ids_field_name: str,
    entity_label: str,
    parent_label: str,
) -> list[uuid.UUID]:
    linked_ids = {row[0] for row in linked_rows}
    if not linked_ids:
        if provided_ids:
            raise ValueError(f"{parent_label} has no linked {entity_label}s")
        return []

    provided = list(provided_ids)
    provided_set = set(provided)
    if len(provided) != len(provided_set):
        raise ValueError(f"{ids_field_name} must not contain duplicates")

    unknown = provided_set - linked_ids
    if unknown:
        raise ValueError(f"{ids_field_name} contains unknown ids for {parent_label}")

    active_ids = {row[0] for row in linked_rows if row[2]}
    inactive_ids = linked_ids - active_ids

    if provided_set == linked_ids:
        return provided
    if provided_set == active_ids:
        inactive_order = sorted(
            inactive_ids,
            key=lambda entity_id: next(row[1] for row in linked_rows if row[0] == entity_id),
        )
        return provided + inactive_order

    missing = linked_ids - provided_set
    missing_active = sorted(active_ids - provided_set, key=str)
    missing_inactive = sorted(inactive_ids - provided_set, key=str)
    parts: list[str] = [
        f"{ids_field_name} must include every {entity_label} linked to {parent_label} "
        f"({len(active_ids)} active, {len(inactive_ids)} inactive), "
        "or only the active ones in the desired order."
    ]
    if missing_active:
        parts.append(
            "Missing active id(s): " + ", ".join(str(entity_id) for entity_id in missing_active)
        )
    if missing_inactive:
        parts.append(
            "Missing inactive id(s) not shown in menu_read active lists: "
            + ", ".join(str(entity_id) for entity_id in missing_inactive)
            + ". Pass active ids in order only, or include inactive ids at the end."
        )
    if not missing_active and not missing_inactive and missing:
        parts.append(
            "Missing linked id(s): "
            + ", ".join(str(entity_id) for entity_id in sorted(missing, key=str))
        )
    raise ValueError(" ".join(parts))


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
    public_menu_only: bool,
) -> list[Product]:
    stmt = (
        select(Product)
        .where(Product.restaurant_id == restaurant_id)
        .options(
            selectinload(Product.categories),
            selectinload(Product.option_groups).selectinload(OptionGroup.items),
        )
        .order_by(
            case((Product.status == "active", 0), else_=1),
            Product.created_at,
            Product.id,
        )
    )
    if public_menu_only:
        stmt = stmt.where(Product.status.in_(("active", "inactive")))
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

    def list_all_categories(
        self, restaurant_id: uuid.UUID, params: PaginationParams
    ) -> CursorPage[CategoryDTO]:
        stmt = (
            select(Category)
            .where(Category.restaurant_id == restaurant_id)
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
        return _product_to_dto(obj, self._session) if obj else None

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
            stmt = stmt.where(Product.status.in_(("active", "inactive")))
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
        if obj is None or obj.status == "draft":
            return False
        obj.status = "draft"
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
            public_menu_only=True,
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
            public_menu_only=False,
        )
        return FullMenuDTO(
            restaurant_id=restaurant_id,
            categories=[CategoryDTO.model_validate(c) for c in categories],
            products=_products_to_dtos(self._session, products),
        )

    def set_category_product_order(
        self, category_id: uuid.UUID, product_ids: list[uuid.UUID]
    ) -> None:
        rows = self._session.execute(
            select(
                product_categories.c.product_id,
                product_categories.c.sort_index,
                Product.status,
            )
            .join(Product, Product.id == product_categories.c.product_id)
            .where(product_categories.c.category_id == category_id)
            .order_by(product_categories.c.sort_index, product_categories.c.product_id)
        ).all()

        linked_ids = {row.product_id for row in rows}
        if not linked_ids:
            if product_ids:
                raise ValueError("Category has no linked products")
            return

        provided = list(product_ids)
        provided_set = set(provided)
        if len(provided) != len(provided_set):
            raise ValueError("product_ids must not contain duplicates")

        unknown = provided_set - linked_ids
        if unknown:
            raise ValueError("product_ids contains products not linked to category")

        active_ids = {row.product_id for row in rows if row.status == "active"}
        inactive_ids = {row.product_id for row in rows if row.status == "inactive"}
        draft_ids = linked_ids - active_ids - inactive_ids

        if provided_set == linked_ids:
            final_order = provided
        elif provided_set == active_ids:
            tail_order = sorted(
                inactive_ids | draft_ids,
                key=lambda product_id: next(
                    row.sort_index
                    for row in rows
                    if row.product_id == product_id
                ),
            )
            final_order = provided + tail_order
        else:
            missing = linked_ids - provided_set
            missing_active = sorted(active_ids - provided_set, key=str)
            missing_inactive = sorted(inactive_ids - provided_set, key=str)
            missing_draft = sorted(draft_ids - provided_set, key=str)
            parts: list[str] = [
                "product_ids must include every product linked to the category "
                f"({len(active_ids)} active, {len(inactive_ids)} inactive, {len(draft_ids)} draft), "
                "or only the active ones in the desired order."
            ]
            if missing_active:
                parts.append(
                    "Missing active product id(s): "
                    + ", ".join(str(product_id) for product_id in missing_active)
                )
            if missing_inactive:
                parts.append(
                    "Missing inactive product id(s): "
                    + ", ".join(str(product_id) for product_id in missing_inactive)
                )
            if missing_draft:
                parts.append(
                    "Missing draft product id(s): "
                    + ", ".join(str(product_id) for product_id in missing_draft)
                )
            if not missing_active and not missing_inactive and not missing_draft and missing:
                parts.append(
                    "Missing linked product id(s): "
                    + ", ".join(str(product_id) for product_id in sorted(missing, key=str))
                )
            raise ValueError(" ".join(parts))

        for index, product_id in enumerate(final_order):
            self._session.execute(
                update(product_categories)
                .where(
                    product_categories.c.category_id == category_id,
                    product_categories.c.product_id == product_id,
                )
                .values(sort_index=index)
            )
        self._session.flush()

    def set_product_option_group_order(
        self, product_id: uuid.UUID, group_ids: list[uuid.UUID]
    ) -> None:
        rows = self._session.execute(
            select(OptionGroup.id, OptionGroup.sort_index, OptionGroup.is_active)
            .where(OptionGroup.product_id == product_id)
            .order_by(OptionGroup.sort_index, OptionGroup.id)
        ).all()
        linked_rows = [(row.id, row.sort_index, row.is_active) for row in rows]
        final_order = _resolve_active_first_entity_order(
            linked_rows=linked_rows,
            provided_ids=group_ids,
            ids_field_name="group_ids",
            entity_label="option group",
            parent_label="product",
        )
        for index, group_id in enumerate(final_order):
            self._session.execute(
                update(OptionGroup)
                .where(OptionGroup.id == group_id)
                .values(sort_index=index)
            )
        self._session.flush()

    def set_option_group_item_order(
        self, option_group_id: uuid.UUID, item_ids: list[uuid.UUID]
    ) -> None:
        rows = self._session.execute(
            select(OptionItem.id, OptionItem.sort_index, OptionItem.is_active)
            .where(OptionItem.option_group_id == option_group_id)
            .order_by(OptionItem.sort_index, OptionItem.id)
        ).all()
        linked_rows = [(row.id, row.sort_index, row.is_active) for row in rows]
        final_order = _resolve_active_first_entity_order(
            linked_rows=linked_rows,
            provided_ids=item_ids,
            ids_field_name="item_ids",
            entity_label="option item",
            parent_label="option group",
        )
        for index, item_id in enumerate(final_order):
            self._session.execute(
                update(OptionItem)
                .where(OptionItem.id == item_id)
                .values(sort_index=index)
            )
        self._session.flush()
