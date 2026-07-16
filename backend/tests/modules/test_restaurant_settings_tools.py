import uuid
from unittest.mock import patch

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.storage.memory_storage import MemoryStorageAdapter
from app.modules.assistant.import_asset_paths import logo_prefix
from app.modules.assistant.import_assets import upload_import_asset
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_write.restaurant_settings_tools import (
    get_restaurant_name,
    get_restaurant_public_menu_url,
    get_restaurant_schedules,
    set_restaurant_schedules,
)
from app.modules.assistant.skills.menu_write.tools import MenuWriteSkill
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db
import base64

MINI_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)


@requires_db
def test_get_restaurant_name(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="La Taquería", subdomain="la-taqueria-settings")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )

    result = get_restaurant_name(ctx)
    assert result.ok is True
    assert result.data["name"] == "La Taquería"


@requires_db
def test_get_restaurant_public_menu_url(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="URL Test", subdomain="url-test-settings")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )

    with patch(
        "app.modules.assistant.skills.menu_write.restaurant_settings_tools.build_public_menu_url",
        return_value="http://url-test-settings.localhost:3000",
    ):
        result = get_restaurant_public_menu_url(ctx)

    assert result.ok is True
    assert result.data["public_menu_url"] == "http://url-test-settings.localhost:3000"
    assert result.data["subdomain"] == "url-test-settings"


@requires_db
def test_set_and_get_restaurant_schedules(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Hours Test", subdomain="hours-test-settings")
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    committed = {"done": False}

    def _invalidate(_ctx):
        committed["done"] = True

    updated = set_restaurant_schedules(
        ctx,
        {
            "schedules": [
                {
                    "service_type": "takeout",
                    "day_of_week": 0,
                    "opens_at": "09:00",
                    "closes_at": "18:00",
                }
            ]
        },
        invalidate=_invalidate,
    )
    assert updated.ok is True
    assert committed["done"] is True

    listed = get_restaurant_schedules(ctx)
    assert listed.ok is True
    assert len(listed.data["schedules"]) == 1
    assert listed.data["schedules"][0]["day_label_es"] == "Lunes"


@requires_db
def test_assign_and_remove_restaurant_logo(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(
        RestaurantCreate(name="Logo Test", subdomain="logo-test-settings")
    )
    storage = MemoryStorageAdapter()
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_write"],
    )
    skill = MenuWriteSkill()

    with patch(
        "app.modules.assistant.import_assets.build_storage",
        return_value=storage,
    ):
        uploaded = upload_import_asset(restaurant.id, "logo.png", MINI_PNG, "image/png")

    with patch(
        "app.modules.assistant.skills.menu_write.restaurant_settings_tools.build_storage",
        return_value=storage,
    ):
        assigned = skill.execute(
            "assign_restaurant_logo",
            {"storage_path": uploaded.path},
            ctx,
        )
    assert assigned.ok is True
    loaded = uow.restaurants.get(restaurant.id)
    assert loaded.logo_path is not None
    assert loaded.logo_path.startswith(logo_prefix(restaurant.id))

    removed = skill.execute("remove_restaurant_logo", {}, ctx)
    assert removed.ok is True
    assert uow.restaurants.get(restaurant.id).logo_path is None


def test_set_restaurant_schedules_rejects_invalid_service_type():
    ctx = type("Ctx", (), {"restaurant_id": uuid.uuid4(), "uow": None})()
    result = set_restaurant_schedules(
        ctx,
        {
            "schedules": [
                {
                    "service_type": "dine_in",
                    "day_of_week": 0,
                    "opens_at": "09:00",
                    "closes_at": "18:00",
                }
            ]
        },
        invalidate=lambda _ctx: None,
    )
    assert result.ok is False
