import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.promotions.tools import PromotionsSkill
from app.modules.menu.schemas import CategoryCreate, OptionGroupCreate, OptionItemCreate, ProductCreate
from app.modules.promotions.option_item_sync import sync_option_items_for_product_change
from app.modules.promotions.schemas import PromotionBundle, PromotionCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_sync_option_items_adds_complements_for_new_product(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Sync", subdomain="promo-sync-unit")
    )
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=0)
    )
    burger = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            price_cents=5000,
            category_ids=[category.id],
        )
    )
    boneless = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    burger_group = uow.menu.add_option_group(
        burger.id,
        OptionGroupCreate(title="Salsa", items=[OptionItemCreate(label="BBQ")]),
    )
    burger_item = burger_group.items[0]
    boneless_group = uow.menu.add_option_group(
        boneless.id,
        OptionGroupCreate(
            title="Tamaño",
            items=[
                OptionItemCreate(label="12 piezas"),
                OptionItemCreate(label="24 piezas", price_delta_cents=5000),
            ],
        ),
    )
    boneless_items = [item.id for item in boneless_group.items]

    synced = sync_option_items_for_product_change(
        uow.menu,
        restaurant.id,
        previous_product_ids=[burger.id],
        new_product_ids=[burger.id, boneless.id],
        current_option_item_ids=[burger_item.id],
    )

    assert burger_item.id in synced
    assert all(item_id in synced for item_id in boneless_items)


@requires_db
def test_set_promotion_targets_adds_new_product_complements(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Targets", subdomain="promo-targets-sync")
    )
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=0)
    )
    burger = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            price_cents=5000,
            category_ids=[category.id],
        )
    )
    boneless = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    burger_group = uow.menu.add_option_group(
        burger.id,
        OptionGroupCreate(title="Salsa", items=[OptionItemCreate(label="BBQ")]),
    )
    burger_item = burger_group.items[0]
    boneless_group = uow.menu.add_option_group(
        boneless.id,
        OptionGroupCreate(
            title="Tamaño",
            items=[OptionItemCreate(label="12 piezas")],
        ),
    )
    boneless_item = boneless_group.items[0]

    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions"],
    )
    skill = PromotionsSkill()

    created = skill.execute(
        "create_promotion",
        {
            "name": "2×1 Hamburguesas",
            "type": "bundle",
            "scope": "product",
            "product_names": ["HAMBURGUESA"],
            "image_path": "restaurants/promo.png",
            "option_item_ids": [str(burger_item.id)],
        },
        ctx,
    )
    assert created.ok is True
    promo_id = created.data["promotion"]["id"]

    updated = skill.execute(
        "set_promotion_targets",
        {
            "promotion_id": promo_id,
            "product_names": ["HAMBURGUESA", "BONELESS & FRIES"],
        },
        ctx,
    )
    assert updated.ok is True

    promo = uow.promotions.get(uuid.UUID(promo_id))
    assert promo is not None
    assert boneless.id in promo.product_ids
    assert burger_item.id in promo.option_item_ids
    assert boneless_item.id in promo.option_item_ids


@requires_db
def test_set_promotion_targets_repairs_missing_complements_without_product_change(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Repair", subdomain="promo-repair-sync")
    )
    category = uow.menu.create_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=0)
    )
    burger = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            price_cents=5000,
            category_ids=[category.id],
        )
    )
    boneless = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    burger_group = uow.menu.add_option_group(
        burger.id,
        OptionGroupCreate(title="Salsa", items=[OptionItemCreate(label="BBQ")]),
    )
    burger_item = burger_group.items[0]
    boneless_group = uow.menu.add_option_group(
        boneless.id,
        OptionGroupCreate(title="Tamaño", items=[OptionItemCreate(label="12 piezas")]),
    )
    boneless_item = boneless_group.items[0]

    promo = uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name="2×1",
            image_path="restaurants/promo.png",
            type="two_for_one",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
            product_ids=[burger.id, boneless.id],
            option_item_ids=[burger_item.id],
        )
    )

    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["promotions"],
    )
    skill = PromotionsSkill()

    updated = skill.execute(
        "set_promotion_targets",
        {
            "promotion_id": str(promo.id),
            "product_names": ["HAMBURGUESA", "BONELESS"],
        },
        ctx,
    )
    assert updated.ok is True

    refreshed = uow.promotions.get(promo.id)
    assert refreshed is not None
    assert boneless_item.id in refreshed.option_item_ids
