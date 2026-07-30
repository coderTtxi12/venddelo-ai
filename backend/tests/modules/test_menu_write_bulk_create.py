import uuid
from types import SimpleNamespace

from app.modules.assistant.skills.menu_write.bulk_create import bulk_create_products


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
