import uuid
from types import SimpleNamespace

from app.modules.assistant.skills.menu_write.bulk import BULK_DEFAULT_LIMIT
from app.modules.assistant.skills.menu_write.bulk_create import (
    bulk_create_categories,
    bulk_create_products,
)


def test_bulk_create_products_continues_after_invalid_nested_item_integer() -> None:
    created_names: list[str] = []

    def create_product(_: uuid.UUID, data: object) -> SimpleNamespace:
        created_names.append(data.name)  # type: ignore[attr-defined]
        return SimpleNamespace(id=uuid.uuid4(), name=data.name)  # type: ignore[attr-defined]

    result = bulk_create_products(
        SimpleNamespace(create_product=create_product),
        SimpleNamespace(restaurant_id=uuid.uuid4()),
        {
            "items": [
                {
                    "name": "Con extras inválidos",
                    "option_groups": [
                        {
                            "title": "Extras",
                            "items": [{"label": "Queso", "price_delta_cents": "bad"}],
                        }
                    ],
                },
                {"name": "Producto válido"},
            ]
        },
        invalidate=lambda _: None,
    )

    assert result.ok is True
    assert result.data["updated"] == 1
    assert result.data["failed"] == 1
    assert result.data["results"][0]["ok"] is False
    assert "bad" in result.data["results"][0]["error"]
    assert result.data["results"][1]["ok"] is True
    assert created_names == ["Producto válido"]


def test_bulk_create_products_rejects_invalid_single_option_group_before_create() -> None:
    create_product_calls = 0

    def create_product(_: uuid.UUID, data: object) -> SimpleNamespace:
        nonlocal create_product_calls
        create_product_calls += 1
        return SimpleNamespace(id=uuid.uuid4(), name=data.name)  # type: ignore[attr-defined]

    result = bulk_create_products(
        SimpleNamespace(create_product=create_product),
        SimpleNamespace(restaurant_id=uuid.uuid4()),
        {
            "items": [
                {
                    "name": "Producto inválido",
                    "option_groups": [
                        {
                            "title": "Elige uno",
                            "selection": "single",
                            "max_selections": 3,
                        }
                    ],
                }
            ]
        },
        invalidate=lambda _: None,
    )

    assert result.data["failed"] == 1
    assert (
        "single selection allows max_selections of 1 at most"
        in result.data["results"][0]["error"]
    )
    assert create_product_calls == 0


def test_bulk_create_rejects_over_limit_without_menu_access() -> None:
    ctx = SimpleNamespace(restaurant_id=uuid.uuid4())
    menu = SimpleNamespace()

    categories = bulk_create_categories(
        menu,
        ctx,
        {"items": [{"name": f"Category {index}"} for index in range(BULK_DEFAULT_LIMIT + 1)]},
        invalidate=lambda _: None,
    )
    products = bulk_create_products(
        menu,
        ctx,
        {"items": [{"name": f"Product {index}"} for index in range(BULK_DEFAULT_LIMIT + 1)]},
        invalidate=lambda _: None,
    )

    assert categories.ok is False
    assert "At most" in categories.summary
    assert products.ok is False
    assert "At most" in products.summary
