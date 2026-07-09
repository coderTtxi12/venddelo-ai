import uuid
from datetime import UTC, datetime

from app.modules.assistant.skills.menu_import.live_menu_cache import build_live_menu_snapshot
from app.modules.menu.schemas import (
    CategoryDTO,
    FullMenuDTO,
    OptionGroupDTO,
    OptionItemDTO,
    ProductDTO,
)
from app.modules.promotions.pricing import CATALOG_DISCOUNT_PREFIX
from app.modules.promotions.schemas import PromotionDTO


def _product(*, name: str, price_cents: int, groups: list[OptionGroupDTO]) -> ProductDTO:
    product_id = uuid.uuid4()
    normalized_groups = [
        group.model_copy(update={"product_id": product_id}) for group in groups
    ]
    return ProductDTO(
        id=product_id,
        restaurant_id=uuid.uuid4(),
        name=name,
        description=None,
        price_cents=price_cents,
        currency="MXN",
        image_path=None,
        status="active",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        category_ids=[],
        option_groups=normalized_groups,
    )


def test_build_live_menu_snapshot_includes_catalog_discount_and_nxm_promo_details():
    group_id = uuid.uuid4()
    salsa_id = uuid.uuid4()
    size_id = uuid.uuid4()
    product = _product(
        name="WINGS & FRIES",
        price_cents=24400,
        groups=[
            OptionGroupDTO(
                id=group_id,
                product_id=uuid.uuid4(),
                title="Salsa",
                required=True,
                selection="single",
                min_selections=1,
                max_selections=1,
                sort_index=0,
                is_active=True,
                items=[
                    OptionItemDTO(
                        id=salsa_id,
                        label="BBQ",
                        price_delta_cents=0,
                        sort_index=0,
                        is_active=True,
                    ),
                    OptionItemDTO(
                        id=size_id,
                        label="24 piezas",
                        price_delta_cents=5000,
                        sort_index=1,
                        is_active=True,
                    ),
                ],
            )
        ],
    )
    category = CategoryDTO(
        id=uuid.uuid4(),
        restaurant_id=uuid.uuid4(),
        name="Alitas",
        description=None,
        image_path=None,
        sort_index=0,
        display_layout=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    menu = FullMenuDTO(
        restaurant_id=uuid.uuid4(),
        categories=[category],
        products=[product],
    )
    percent_promo = PromotionDTO(
        id=uuid.uuid4(),
        restaurant_id=menu.restaurant_id,
        name=f"{CATALOG_DISCOUNT_PREFIX} WINGS",
        image_path="promos/discount.png",
        type="percent",
        scope="product",
        percent=15,
        amount_cents=None,
        min_order_cents=None,
        starts_at=None,
        ends_at=None,
        bundle_get_quantity=None,
        bundle_pay_quantity=None,
        bundle_pairing_mode="cross_product",
        recurrence_weekdays=None,
        recurrence_start_time=None,
        recurrence_end_time=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=[product.id],
        category_ids=[],
        option_item_ids=[],
    )
    nxm_promo = PromotionDTO(
        id=uuid.uuid4(),
        restaurant_id=menu.restaurant_id,
        name="2×1 Alitas",
        image_path="promos/2x1.png",
        type="two_for_one",
        scope="product",
        percent=None,
        amount_cents=None,
        min_order_cents=None,
        starts_at=None,
        ends_at=None,
        bundle_get_quantity=2,
        bundle_pay_quantity=1,
        bundle_pairing_mode="same_product",
        recurrence_weekdays=[5, 6],
        recurrence_start_time=None,
        recurrence_end_time=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        product_ids=[product.id],
        category_ids=[],
        option_item_ids=[salsa_id],
        effective_status="active",
    )

    snapshot = build_live_menu_snapshot(menu, promotions=[percent_promo, nxm_promo])

    product_row = snapshot["products"][0]
    assert product_row["has_catalog_discount"] is True
    assert product_row["catalog_discount"]["type"] == "percent"
    assert product_row["catalog_discount"]["percent"] == 15

    salsa_group = product_row["option_groups"][0]
    assert salsa_group["id"] == str(group_id)
    assert salsa_group["min_selections"] == 1
    assert salsa_group["max_selections"] == 1
    assert salsa_group["sort_index"] == 0

    assert snapshot["counts"]["nxm_promotions"] == 1
    assert snapshot["counts"]["products_with_catalog_discount"] == 1

    nxm = snapshot["nxm_promotions"][0]
    assert nxm["name"] == "2×1 Alitas"
    assert nxm["label"] == "2×1"
    assert nxm["products"] == [{"id": str(product.id), "name": "WINGS & FRIES"}]
    assert nxm["schedule"]["weekdays"] == [5, 6]
    assert nxm["participating_complements"] == [
        {
            "id": str(salsa_id),
            "label": "BBQ",
            "product_id": str(product.id),
            "product_name": "WINGS & FRIES",
            "group_title": "Salsa",
            "price_delta_cents": 0,
        }
    ]
    assert len(nxm["excluded_complements"]) == 1
    assert nxm["excluded_complements"][0]["label"] == "24 piezas"
