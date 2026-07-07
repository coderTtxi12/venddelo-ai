import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import (
    DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
    DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
    MenuReadSkill,
    _build_special_categories,
)
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryUpdate,
    OptionGroupCreate,
    OptionItemCreate,
    ProductCreate,
    ProductUpdate,
)
from app.modules.promotions.pricing import CATALOG_DISCOUNT_PREFIX
from app.modules.promotions.schemas import PromotionBundle, PromotionCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


from types import SimpleNamespace


def test_build_special_categories_orders_promotions_before_limited_time():
    restaurant = SimpleNamespace(
        digital_menu_promotions_category_enabled=True,
        digital_menu_promotions_category_name="Ofertas",
        digital_menu_limited_time_category_enabled=True,
        digital_menu_limited_time_category_name="Por ultra ilimitado",
    )
    specials = _build_special_categories(
        restaurant,
        has_promotion_shortcuts=True,
        has_limited_time_products=False,
    )

    assert len(specials) == 2
    assert specials[0]["id"] == DIGITAL_MENU_PROMOTIONS_CATEGORY_ID
    assert specials[0]["name"] == "Ofertas"
    assert specials[0]["menu_order"] == 1
    assert specials[0]["visible_in_digital_menu"] is True
    assert specials[1]["id"] == DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID
    assert specials[1]["name"] == "Por ultra ilimitado"
    assert specials[1]["menu_order"] == 2
    assert specials[1]["visible_in_digital_menu"] is False
    assert specials[1]["is_active"] is True


@requires_db
def test_menu_read_lists_categories_and_searches_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(RestaurantCreate(name="Menu Read", subdomain="menu-read"))
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco al pastor",
            description="Con piña",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    categories = skill.execute("list_categories", {}, ctx)
    products = skill.execute("search_products", {"query": "pastor"}, ctx)

    assert categories.ok is True
    assert categories.data["categories"][0]["category_type"] == "special_promotions"
    assert categories.data["categories"][1]["category_type"] == "special_limited_time"
    regular = categories.data["categories"][2]
    assert regular["name"] == "Tacos"
    assert regular["category_type"] == "regular"
    assert regular["image_path"] is None
    assert regular["display_layout"] is None
    assert regular["is_active"] is True
    assert products.ok is True
    assert products.data["products"][0]["id"] == str(product.id)


@requires_db
def test_menu_read_search_tolerates_typos(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Fuzzy Menu", subdomain="menu-read-fuzzy")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    typo = skill.execute("search_products", {"query": "wins and fries"}, ctx)
    other_language = skill.execute("search_products", {"query": "alitas"}, ctx)

    assert typo.ok is True
    assert [item["id"] for item in typo.data["products"]] == [str(product.id)]
    assert "match_score" in typo.data["products"][0]

    # Cross-language returns nothing here; the agent must fall back to list_products.
    assert other_language.ok is True
    assert other_language.data["products"] == []
    assert other_language.data["suggestions"] == []


@requires_db
def test_menu_read_list_categories_includes_image_and_display_layout(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Category Layout", subdomain="menu-read-cat-layout")
    )
    category = uow.menu.add_category(
        CategoryCreate(
            restaurant_id=restaurant.id,
            name="Combos",
            description="Los mejores combos",
            image_path="categories/combos.png",
            sort_index=1,
        )
    )
    uow.menu.update_category(
        restaurant.id,
        category.id,
        CategoryUpdate(display_layout="grid"),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("list_categories", {}, ctx)

    assert result.ok is True
    payload = next(
        item for item in result.data["categories"] if item["category_type"] == "regular"
    )
    assert payload["name"] == "Combos"
    assert payload["image_path"] == "categories/combos.png"
    assert payload["display_layout"] == "grid"


@requires_db
def test_menu_read_get_product_disambiguates_shared_token_names(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Shared Token", subdomain="menu-read-shared-token")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    burger = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    boneless_fries = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES WITC SAUCE",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    target = skill.execute(
        "get_product", {"name": "BONELESS & FRIES WITC SAUCE"}, ctx
    )
    other = skill.execute("get_product", {"name": "BURGER & BONELESS"}, ctx)

    assert target.ok is True
    assert target.data["product"]["id"] == str(boneless_fries.id)
    assert other.ok is True
    assert other.data["product"]["id"] == str(burger.id)


@requires_db
def test_menu_read_search_wings_fries_matches_boneless_when_no_exact_name(session):
    """When no product is literally named WINGS & FRIES, alias matching picks boneless."""
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Wings Alias", subdomain="menu-read-wings-alias")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    boneless_fries = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES WITC SAUCE",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("search_products", {"query": "Wings & Fries"}, ctx)

    assert result.ok is True
    assert [item["id"] for item in result.data["products"]] == [str(boneless_fries.id)]
    assert result.data["suggestions"] == []


@requires_db
def test_menu_read_search_wild_rooster_prefers_exact_inactive_wings_and_fries(session):
    """Wild Rooster has an inactive WINGS & FRIES plus active boneless neighbors."""
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Wild Rooster", subdomain="menu-read-wild-rooster")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    wings_fries = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            description="Alitas crujientes con papas.",
            price_cents=24400,
            category_ids=[category.id],
            status="active",
        )
    )
    wings_fries = uow.menu.update_product(
        wings_fries.id,
        ProductUpdate(status="inactive"),
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES WITC SAUCE",
            price_cents=22900,
            category_ids=[category.id],
            status="active",
        )
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=25900,
            category_ids=[category.id],
            status="active",
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("search_products", {"query": "Wings & Fries"}, ctx)

    assert result.ok is True
    assert result.summary == "Found 1 matching products"
    assert [item["id"] for item in result.data["products"]] == [str(wings_fries.id)]
    assert result.data["products"][0]["name"] == "WINGS & FRIES"
    assert result.data["products"][0]["status"] == "inactive"
    assert result.data["products"][0]["match_score"] == 1.0
    assert result.data["suggestions"] == []


@requires_db
def test_menu_read_search_ignores_legacy_active_only_arg(session):
    """active_only was removed; search always uses the full owner catalog."""
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Wild Rooster Legacy Arg", subdomain="menu-read-wr-legacy-arg")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    wings_fries = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
            category_ids=[category.id],
            status="active",
        )
    )
    wings_fries = uow.menu.update_product(
        wings_fries.id,
        ProductUpdate(status="inactive"),
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES WITC SAUCE",
            price_cents=22900,
            category_ids=[category.id],
            status="active",
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute(
        "search_products",
        {"query": "Wings & Fries", "active_only": True},
        ctx,
    )

    assert result.ok is True
    assert [item["id"] for item in result.data["products"]] == [str(wings_fries.id)]
    assert result.data["products"][0]["name"] == "WINGS & FRIES"
    assert result.data["products"][0]["match_score"] == 1.0


@requires_db
def test_menu_read_search_finds_draft_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Draft Search", subdomain="menu-read-draft-search")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    draft_product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Wings & Fries",
            price_cents=22900,
            category_ids=[category.id],
            status="draft",
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("search_products", {"query": "Wings & Fries"}, ctx)

    assert result.ok is True
    assert [item["id"] for item in result.data["products"]] == [str(draft_product.id)]
    assert result.data["products"][0]["status"] == "draft"


@requires_db
def test_menu_read_get_product_is_tenant_scoped(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    owned = uow.restaurants.add(RestaurantCreate(name="Owned", subdomain="owned-read"))
    other = uow.restaurants.add(RestaurantCreate(name="Other", subdomain="other-read"))
    uow.menu.add_category(CategoryCreate(restaurant_id=owned.id, name="Owned category"))
    other_category = uow.menu.add_category(
        CategoryCreate(restaurant_id=other.id, name="Other category")
    )
    other_product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=other.id,
            name="Other taco",
            price_cents=1000,
            category_ids=[other_category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=owned.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("get_product", {"product_id": str(other_product.id)}, ctx)

    assert result.ok is False
    assert "not found" in result.summary.lower()


@requires_db
def test_menu_read_list_products_paginates_all_active_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Paginated Menu", subdomain="menu-read-page")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    for index in range(5):
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name=f"Taco {index}",
                price_cents=1000 + index,
                category_ids=[category.id],
            )
        )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    first = skill.execute("list_products", {"limit": 2}, ctx)
    second = skill.execute(
        "list_products",
        {"limit": 2, "cursor": first.data["next_cursor"]},
        ctx,
    )

    assert first.ok is True
    assert len(first.data["products"]) == 2
    assert first.data["has_more"] is True
    assert first.data["next_cursor"]

    assert second.ok is True
    assert len(second.data["products"]) == 2
    assert second.data["has_more"] is True

    third = skill.execute(
        "list_products",
        {"limit": 2, "cursor": second.data["next_cursor"]},
        ctx,
    )
    assert third.ok is True
    assert len(third.data["products"]) == 1
    assert third.data["has_more"] is False


@requires_db
def test_menu_read_list_products_counts_catalog_total_not_page_size(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Catalog Counts", subdomain="menu-read-counts")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    for index in range(5):
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name=f"Taco {index}",
                price_cents=1000 + index,
                category_ids=[category.id],
            )
        )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("list_products", {"limit": 1}, ctx)

    assert result.ok is True
    assert len(result.data["products"]) == 1
    assert result.data["has_more"] is True
    assert result.data["counts"]["total"] == 5
    assert result.data["page_counts"]["total"] == 1


@requires_db
def test_menu_read_list_products_filters_by_category(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Category Filter", subdomain="menu-read-category")
    )
    tacos = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    drinks = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Bebidas", sort_index=2)
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco pastor",
            price_cents=1200,
            category_ids=[tacos.id],
        )
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Agua",
            price_cents=300,
            category_ids=[drinks.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    tacos_page = skill.execute("list_products", {"category_id": str(tacos.id)}, ctx)
    all_page = skill.execute("list_products", {}, ctx)

    assert tacos_page.ok is True
    assert len(tacos_page.data["products"]) == 1
    assert tacos_page.data["products"][0]["name"] == "Taco pastor"
    assert tacos_page.data["category_id"] == str(tacos.id)

    assert all_page.ok is True
    assert len(all_page.data["products"]) == 2


@requires_db
def test_menu_read_get_product_resolves_by_name(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="By Name", subdomain="menu-read-by-name")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    by_name = skill.execute("get_product", {"name": "burger boneless"}, ctx)
    by_bad_uuid_with_name = skill.execute(
        "get_product",
        {"product_id": "not-a-uuid", "name": "BURGER & BONELESS"},
        ctx,
    )
    missing = skill.execute("get_product", {"name": "sushi"}, ctx)

    assert by_name.ok is True
    assert by_name.data["product"]["id"] == str(product.id)

    assert by_bad_uuid_with_name.ok is True
    assert by_bad_uuid_with_name.data["product"]["id"] == str(product.id)

    assert missing.ok is False
    assert missing.data["suggestions"] == []


@requires_db
def test_menu_read_product_payload_exposes_option_context(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Options", subdomain="menu-read-options")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Classic Burger",
            description="Beef patty",
            price_cents=12000,
            image_path="products/burger.png",
            category_ids=[category.id],
        )
    )
    # Second group has a lower sort_index, so it must come first in the payload.
    extras = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Extras",
            required=False,
            selection="multi",
            min_selections=0,
            max_selections=2,
            sort_index=2,
            items=[
                OptionItemCreate(label="Bacon", price_delta_cents=1500, sort_index=2),
                OptionItemCreate(label="Cheese", price_delta_cents=1000, sort_index=1),
            ],
        ),
    )
    size = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(
            title="Size",
            required=True,
            selection="single",
            sort_index=1,
            items=[OptionItemCreate(label="Large", price_delta_cents=2000)],
        ),
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)

    assert result.ok is True
    payload = result.data["product"]
    assert payload["image_path"] == "products/burger.png"
    assert payload["status"] == "draft"
    assert payload["has_options"] is True
    assert payload["category_sort_indices"][str(category.id)] == 0

    groups = payload["option_groups"]
    assert [g["id"] for g in groups] == [str(size.id), str(extras.id)]

    size_group = groups[0]
    assert size_group["selection_summary"] == "Elige 1 · Obligatorio"

    extras_group = groups[1]
    assert extras_group["max_selections"] == 2
    assert extras_group["selection_summary"] == "Elige hasta 2 (opcional)"
    # Items sorted by sort_index → Cheese (1) before Bacon (2).
    assert [item["label"] for item in extras_group["items"]] == ["Cheese", "Bacon"]
    assert extras_group["items"][0]["price_delta_cents"] == 1000


@requires_db
def test_menu_read_lists_and_filters_promotions(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promos", subdomain="menu-read-promos")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Alitas", sort_index=1)
    )
    wings = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
            category_ids=[category.id],
        )
    )
    bundle = uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name="2x1 Alitas",
            image_path="promos/2x1.png",
            type="bundle",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1, pairing_mode="same_product"),
            product_ids=[wings.id],
        )
    )
    # Auto catalog discount — should be hidden unless include_catalog is set.
    uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name=f"{CATALOG_DISCOUNT_PREFIX}WINGS & FRIES",
            type="percent",
            scope="product",
            percent=15,
            product_ids=[wings.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    default_list = skill.execute("list_promotions", {}, ctx)
    without_catalog = skill.execute("list_promotions", {"include_catalog": False}, ctx)

    # Default now includes product discounts (percent/amount) alongside bundles.
    assert default_list.ok is True
    assert len(default_list.data["promotions"]) == 2
    by_type = {p["type"]: p for p in default_list.data["promotions"]}
    assert by_type["bundle"]["id"] == str(bundle.id)
    assert by_type["bundle"]["label"] == "2×1"
    assert by_type["bundle"]["bundle"]["pairing_mode"] == "same_product"
    assert by_type["percent"]["is_catalog_discount"] is True

    # Opt-out hides catalog discounts and leaves only the marketing bundle.
    assert without_catalog.ok is True
    ids = [promo["id"] for promo in without_catalog.data["promotions"]]
    assert ids == [str(bundle.id)]


@requires_db
def test_menu_read_list_product_promotions_includes_discount_and_bundle(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Double Promo", subdomain="menu-read-double")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Burgers", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            price_cents=25900,
            category_ids=[category.id],
        )
    )
    discount = uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name=f"{CATALOG_DISCOUNT_PREFIX}BURGER & BONELESS",
            type="amount",
            scope="product",
            amount_cents=5900,
            product_ids=[product.id],
        )
    )
    bundle = uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name="Hamburguesas 2x1",
            image_path="promos/burger.png",
            type="bundle",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1, pairing_mode="same_product"),
            product_ids=[product.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute(
        "list_product_promotions", {"name": "burger boneless"}, ctx
    )

    assert result.ok is True
    assert result.data["product"]["id"] == str(product.id)
    promos = {p["type"]: p for p in result.data["promotions"]}
    assert set(promos) == {"amount", "bundle"}
    assert promos["amount"]["id"] == str(discount.id)
    assert promos["amount"]["amount_cents"] == 5900
    assert promos["amount"]["is_catalog_discount"] is True
    assert promos["amount"]["applies_via"] == "product"
    assert promos["bundle"]["id"] == str(bundle.id)
    assert promos["bundle"]["applies_via"] == "product"

    # get_product also surfaces the same promotions inline.
    detail = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)
    assert detail.ok is True
    assert detail.data["product"]["has_promotions"] is True
    detail_types = {p["type"] for p in detail.data["product"]["promotions"]}
    assert detail_types == {"amount", "bundle"}


@requires_db
def test_menu_read_bundle_reports_non_participating_complements(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bundle Opts", subdomain="menu-read-bundle-opts")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Wings", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS",
            price_cents=20000,
            category_ids=[category.id],
        )
    )
    group = uow.menu.add_option_group(
        product.id,
        OptionGroupCreate(title="Salsas", selection="multi", max_selections=2),
    )
    eligible = uow.menu.add_option_item(
        group.id, OptionItemCreate(label="BBQ", price_delta_cents=0)
    )
    excluded = uow.menu.add_option_item(
        group.id, OptionItemCreate(label="Trufa premium", price_delta_cents=3000)
    )
    bundle = uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name="Wings 2x1",
            image_path="promos/wings.png",
            type="bundle",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1, pairing_mode="same_product"),
            product_ids=[product.id],
            option_item_ids=[eligible.id],  # only BBQ participates
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    detail = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)

    assert detail.ok is True
    promos = detail.data["product"]["promotions"]
    bundle_payload = next(p for p in promos if p["id"] == str(bundle.id))
    participation = bundle_payload["option_participation"]
    assert participation["semantics"] == "bundle_allow_list"
    assert participation["mode"] == "restricted"
    participating_labels = [it["label"] for it in participation["participating"]]
    not_participating_labels = [it["label"] for it in participation["not_participating"]]
    assert participating_labels == ["BBQ"]
    assert not_participating_labels == ["Trufa premium"]
    assert str(excluded.id) in {it["id"] for it in participation["not_participating"]}

    listed = MenuReadSkill().execute("list_products", {}, ctx)
    assert listed.ok is True
    listed_product = next(
        item for item in listed.data["products"] if item["id"] == str(product.id)
    )
    assert listed_product["has_promotions"] is True
    listed_bundle = next(
        p for p in listed_product["promotions"] if p["id"] == str(bundle.id)
    )
    listed_participation = listed_bundle["option_participation"]
    assert listed_participation["mode"] == "restricted"
    assert [it["label"] for it in listed_participation["not_participating"]] == [
        "Trufa premium"
    ]


@requires_db
def test_menu_read_bundle_without_allow_list_lets_all_complements_participate(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bundle All", subdomain="menu-read-bundle-all")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Wings", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS PLAIN",
            price_cents=20000,
            category_ids=[category.id],
        )
    )
    group = uow.menu.add_option_group(
        product.id, OptionGroupCreate(title="Salsas", selection="multi")
    )
    uow.menu.add_option_item(group.id, OptionItemCreate(label="BBQ"))
    uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name="Wings Plain 2x1",
            image_path="promos/wings-plain.png",
            type="bundle",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
            product_ids=[product.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    detail = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)

    assert detail.ok is True
    participation = detail.data["product"]["promotions"][0]["option_participation"]
    assert participation["mode"] == "all_participate"


@requires_db
def test_menu_read_get_product_reports_no_promotions(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="No Promo", subdomain="menu-read-no-promo")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco simple",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    detail = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)

    assert detail.ok is True
    assert detail.data["product"]["has_promotions"] is False
    assert detail.data["product"]["promotions"] == []


@requires_db
def test_menu_read_get_promotion_by_id_and_name(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Promo Detail", subdomain="menu-read-promo-detail")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Boneless", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES",
            price_cents=22900,
            category_ids=[category.id],
        )
    )
    promo = uow.promotions.add(
        PromotionCreate(
            restaurant_id=restaurant.id,
            name="Martes Boneless",
            image_path="promos/martes.png",
            type="percent",
            scope="product",
            percent=20,
            product_ids=[product.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    by_id = skill.execute("get_promotion", {"promotion_id": str(promo.id)}, ctx)
    by_name = skill.execute("get_promotion", {"name": "martes boneless"}, ctx)
    missing = skill.execute("get_promotion", {"name": "viernes pizza"}, ctx)

    assert by_id.ok is True
    assert by_id.data["promotion"]["id"] == str(promo.id)
    assert by_id.data["promotion"]["percent"] == 20
    assert by_id.data["promotion"]["products"][0]["name"] == "BONELESS & FRIES"
    assert by_id.data["promotion"]["effective_status"] is not None

    assert by_name.ok is True
    assert by_name.data["promotion"]["id"] == str(promo.id)

    assert missing.ok is False
    assert missing.data["suggestions"] == []


@requires_db
def test_menu_read_get_promotion_is_tenant_scoped(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    owned = uow.restaurants.add(RestaurantCreate(name="Owned P", subdomain="owned-promo"))
    other = uow.restaurants.add(RestaurantCreate(name="Other P", subdomain="other-promo"))
    other_category = uow.menu.add_category(
        CategoryCreate(restaurant_id=other.id, name="Other", sort_index=1)
    )
    other_product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=other.id,
            name="Other combo",
            price_cents=1000,
            category_ids=[other_category.id],
        )
    )
    other_promo = uow.promotions.add(
        PromotionCreate(
            restaurant_id=other.id,
            name="Other 2x1",
            image_path="promos/other.png",
            type="bundle",
            scope="product",
            bundle=PromotionBundle(get_quantity=2, pay_quantity=1),
            product_ids=[other_product.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=owned.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute(
        "get_promotion", {"promotion_id": str(other_promo.id)}, ctx
    )

    assert result.ok is False
    assert "not found" in result.summary.lower()


@requires_db
def test_menu_read_get_product_returns_owned_product(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Owned Product", subdomain="menu-read-owned-product")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco suadero",
            price_cents=1100,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("get_product", {"product_id": str(product.id)}, ctx)

    assert result.ok is True
    assert result.data["product"]["name"] == "Taco suadero"


@requires_db
def test_menu_read_search_hamburguesa_prefers_exact_name_over_neighbor_description(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Burger Menu", subdomain="menu-read-hamburguesa")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Hamburguesas", sort_index=1)
    )
    hamburguesa = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="HAMBURGUESA",
            description="Clásica",
            price_cents=10000,
            category_ids=[category.id],
            status="active",
        ),
    )
    hamburguesa = uow.menu.update_product(
        hamburguesa.id,
        ProductUpdate(status="inactive"),
    )
    uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BURGER & BONELESS",
            description="Combo de hamburguesa con boneless",
            price_cents=10000,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    search = skill.execute("search_products", {"query": "hamburguesa"}, ctx)
    get_by_name = skill.execute("get_product", {"name": "Hamburguesa"}, ctx)
    listed = skill.execute("list_products", {}, ctx)

    assert search.ok is True
    assert len(search.data["products"]) == 1
    assert search.data["products"][0]["name"] == "HAMBURGUESA"
    assert get_by_name.ok is True
    assert get_by_name.data["product"]["id"] == str(hamburguesa.id)
    assert get_by_name.data["product"]["status"] == "inactive"
    assert any(item["name"] == "HAMBURGUESA" for item in listed.data["products"])


def test_menu_read_parse_bulk_get_product_refs():
    from app.modules.assistant.skills.menu_read.tools import _parse_bulk_get_product_refs

    refs, err = _parse_bulk_get_product_refs(
        {
            "product_ids": ["13871a47-cf3e-47a2-86b7-2bd15a1d2826"],
            "names": ["Wings & Fries"],
            "items": [{"name": "Burger"}],
        }
    )
    assert err is None
    assert refs == [
        {"product_id": "13871a47-cf3e-47a2-86b7-2bd15a1d2826"},
        {"name": "Wings & Fries"},
        {"name": "Burger"},
    ]

    empty_refs, empty_err = _parse_bulk_get_product_refs({})
    assert empty_refs == []
    assert empty_err is not None


@requires_db
def test_menu_read_bulk_get_products_by_ids_and_names(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Get", subdomain="menu-read-bulk-get")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Combos", sort_index=1)
    )
    wings = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="WINGS & FRIES",
            price_cents=24400,
            category_ids=[category.id],
            status="active",
        )
    )
    boneless = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="BONELESS & FRIES WITC SAUCE",
            price_cents=22900,
            category_ids=[category.id],
            status="active",
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    result = skill.execute(
        "bulk_get_products",
        {
            "product_ids": [str(wings.id)],
            "names": ["boneless & fries"],
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["found"] == 2
    assert result.data["failed"] == 0
    assert {item["name"] for item in result.data["products"]} == {
        "WINGS & FRIES",
        "BONELESS & FRIES WITC SAUCE",
    }
    assert all("status" in item for item in result.data["products"])
    assert all(row["ok"] for row in result.data["results"])


@requires_db
def test_menu_read_bulk_get_products_reports_partial_misses(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Bulk Get Miss", subdomain="menu-read-bulk-get-miss")
    )
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    taco = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco al pastor",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    result = skill.execute(
        "bulk_get_products",
        {
            "items": [
                {"product_id": str(taco.id)},
                {"name": "sushi"},
            ]
        },
        ctx,
    )

    assert result.ok is True
    assert result.data["found"] == 1
    assert result.data["failed"] == 1
    assert result.data["products"][0]["name"] == "Taco al pastor"
    assert result.data["results"][1]["ok"] is False
