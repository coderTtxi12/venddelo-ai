import uuid
from datetime import UTC, datetime

import pytest

from app.core.exceptions import ValidationError
from app.core.pagination import CursorPage
from app.modules.menu.repository import MenuRepository
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryDTO,
    FullMenuDTO,
    OptionGroupCreate,
    OptionGroupDTO,
    OptionGroupUpdate,
    OptionItemCreate,
    OptionItemDTO,
    ProductCreate,
    ProductDTO,
    ProductUpdate,
)
from app.modules.menu.service import MenuService

RESTAURANT_ID = uuid.uuid4()
CAT_ID = uuid.uuid4()


def _product(**kwargs) -> ProductDTO:
    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        restaurant_id=RESTAURANT_ID,
        name="P",
        price_cents=1000,
        currency="USD",
        status="draft",
        created_at=now,
        updated_at=now,
        category_ids=[CAT_ID],
    )
    defaults.update(kwargs)
    return ProductDTO(**defaults)


class FakeMenuRepo(MenuRepository):
    def __init__(self) -> None:
        self.products: dict[uuid.UUID, ProductDTO] = {}
        self.categories: dict[uuid.UUID, CategoryDTO] = {}

    def add_category(self, data: CategoryCreate) -> CategoryDTO:
        now = datetime.now(UTC)
        dto = CategoryDTO(
            id=CAT_ID,
            restaurant_id=data.restaurant_id,
            name=data.name,
            sort_index=data.sort_index,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.categories[CAT_ID] = dto
        return dto

    def get_category(self, id: uuid.UUID) -> CategoryDTO | None:
        return self.categories.get(id)

    def get_category_by_id(self, id: uuid.UUID) -> CategoryDTO | None:
        return self.categories.get(id)

    def list_categories(self, restaurant_id, params):
        return CursorPage(items=[])

    def list_all_categories(self, restaurant_id, params):
        return CursorPage(items=[])

    def update_category(self, id, data):
        return self.categories.get(id)

    def soft_delete_category(self, id):
        return True

    def add_product(self, data: ProductCreate) -> ProductDTO:
        p = _product(name=data.name, category_ids=data.category_ids)
        self.products[p.id] = p
        return p

    def get_product(self, id: uuid.UUID) -> ProductDTO | None:
        return self.products.get(id)

    def get_product_by_id(self, id: uuid.UUID) -> ProductDTO | None:
        return self.products.get(id)

    def list_products(self, restaurant_id, params, *, published_only=False):
        return CursorPage(items=[])

    def update_product(self, id, data: ProductUpdate) -> ProductDTO | None:
        p = self.products.get(id)
        if p is None:
            return None
        if data.status is not None:
            p = p.model_copy(update={"status": data.status})
        self.products[id] = p
        return p

    def set_category_product_order(
        self, category_id: uuid.UUID, product_ids: list[uuid.UUID]
    ) -> None:
        return None

    def set_product_option_group_order(
        self, product_id: uuid.UUID, group_ids: list[uuid.UUID]
    ) -> None:
        return None

    def set_option_group_item_order(
        self, option_group_id: uuid.UUID, item_ids: list[uuid.UUID]
    ) -> None:
        return None

    def soft_delete_product(self, id):
        return True

    def add_option_group(self, product_id, data: OptionGroupCreate) -> OptionGroupDTO:
        return OptionGroupDTO(
            id=uuid.uuid4(),
            product_id=product_id,
            title=data.title,
            required=data.required,
            selection=data.selection,
            min_selections=data.min_selections,
            max_selections=data.max_selections,
            sort_index=data.sort_index,
            is_active=True,
            items=[],
        )

    def update_option_group(self, id, data: OptionGroupUpdate):
        return None

    def delete_option_group(self, id):
        return True

    def add_option_item(self, option_group_id, data: OptionItemCreate) -> OptionItemDTO:
        return OptionItemDTO(
            id=uuid.uuid4(),
            label=data.label,
            price_delta_cents=data.price_delta_cents,
            sort_index=data.sort_index,
            is_active=True,
        )

    def delete_option_item(self, id):
        return True

    def update_option_item(self, id, data):
        return None

    def get_full_menu(self, restaurant_id: uuid.UUID) -> FullMenuDTO:
        return FullMenuDTO(restaurant_id=restaurant_id, categories=[], products=[])


def test_product_requires_category():
    repo = FakeMenuRepo()
    svc = MenuService(repo)
    with pytest.raises(ValidationError):
        svc.create_product(
            RESTAURANT_ID,
            ProductCreate(
                restaurant_id=RESTAURANT_ID,
                name="P",
                price_cents=100,
                category_ids=[],
            ),
        )


def _seed_category(repo: FakeMenuRepo) -> None:
    now = datetime.now(UTC)
    repo.categories[CAT_ID] = CategoryDTO(
        id=CAT_ID,
        restaurant_id=RESTAURANT_ID,
        name="Cat",
        sort_index=0,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def test_update_product_allows_inactive_category():
    repo = FakeMenuRepo()
    now = datetime.now(UTC)
    inactive_cat_id = uuid.uuid4()
    repo.categories[inactive_cat_id] = CategoryDTO(
        id=inactive_cat_id,
        restaurant_id=RESTAURANT_ID,
        name="Inactive",
        sort_index=0,
        is_active=False,
        created_at=now,
        updated_at=now,
    )
    product = _product(category_ids=[inactive_cat_id])
    repo.products[product.id] = product
    svc = MenuService(repo)
    svc.update_product(
        RESTAURANT_ID,
        product.id,
        ProductUpdate(category_ids=[inactive_cat_id]),
    )


def test_option_group_validates_single_max():
    repo = FakeMenuRepo()
    _seed_category(repo)
    svc = MenuService(repo)
    p = svc.create_product(
        RESTAURANT_ID,
        ProductCreate(
            restaurant_id=RESTAURANT_ID,
            name="P",
            price_cents=100,
            category_ids=[CAT_ID],
        ),
    )
    with pytest.raises(ValidationError):
        svc.add_option_group(
            RESTAURANT_ID,
            p.id,
            OptionGroupCreate(title="Size", selection="single", max_selections=3),
        )
