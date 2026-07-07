from app.modules.menu.schemas import (
    CategoryDTO,
    FullMenuDTO,
    ProductDTO,
)
from app.modules.restaurants.schemas import RestaurantDTO
from app.modules.translations.adapters import SqlAlchemyTranslationRepository
from app.modules.translations.schemas import TranslationUpsert
from app.modules.translations.service import TranslationService
from tests.conftest import requires_db


def _restaurant_dto(rid, subdomain="tr"):
    return RestaurantDTO(
        id=rid,
        name="Tr",
        subdomain=subdomain,
        original_language="es",
        status="published",
        is_active=True,
        created_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        updated_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )


@requires_db
def test_translate_menu_uses_cached_translation(session):
    import uuid

    from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
    from app.modules.restaurants.schemas import RestaurantCreate

    r = SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="Tr", subdomain="tr-menu", original_language="es")
    )
    cat_id = uuid.uuid4()
    prod_id = uuid.uuid4()
    menu = FullMenuDTO(
        restaurant_id=r.id,
        categories=[
            CategoryDTO(
                id=cat_id,
                restaurant_id=r.id,
                name="Platos",
                sort_index=0,
                is_active=True,
                created_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
                updated_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
            )
        ],
        products=[
            ProductDTO(
                id=prod_id,
                restaurant_id=r.id,
                name="Taco",
                description="Rico",
                price_cents=500,
                currency="USD",
                status="active",
                created_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
                updated_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
            )
        ],
    )
    repo = SqlAlchemyTranslationRepository(session)
    repo.upsert(
        TranslationUpsert(
            restaurant_id=r.id,
            locale="en",
            entity_type="product",
            entity_id=prod_id,
            field="name",
            translated_text="Al Pastor Taco",
            source_hash=__import__(
                "app.modules.translations.hash", fromlist=["compute_source_hash"]
            ).compute_source_hash("Taco"),
        )
    )
    session.commit()

    svc = TranslationService(repo)
    out = svc.translate_menu(menu, _restaurant_dto(r.id, "tr-menu"), "en")
    assert out.products[0].name == "Al Pastor Taco"
    assert out.categories[0].name == "Platos"


@requires_db
def test_translate_menu_falls_back_to_source_without_cache(session):
    import uuid

    from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
    from app.modules.restaurants.schemas import RestaurantCreate

    r = SqlAlchemyRestaurantRepository(session).add(
        RestaurantCreate(name="Tr", subdomain="tr-menu2", original_language="es")
    )
    prod_id = uuid.uuid4()
    menu = FullMenuDTO(
        restaurant_id=r.id,
        categories=[],
        products=[
            ProductDTO(
                id=prod_id,
                restaurant_id=r.id,
                name="Taco",
                description="Rico",
                price_cents=500,
                currency="USD",
                status="active",
                created_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
                updated_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
            )
        ],
    )
    svc = TranslationService(SqlAlchemyTranslationRepository(session))
    out = svc.translate_menu(menu, _restaurant_dto(r.id, "tr-menu2"), "en")
    assert out.products[0].name == "Taco"
