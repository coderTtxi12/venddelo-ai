import uuid

import pytest

from app.modules.assistant.entitlements.adapters import SqlAlchemyRestaurantEntitlementsRepository
from app.modules.assistant.entitlements.catalog import DEFAULT_GRANTED_SKILL_IDS, SKILL_CATALOG
from app.modules.assistant.entitlements.resolver import resolve_entitlements, resolve_granted_skill_ids
from app.modules.assistant.entitlements.schemas import RestaurantEntitlementsRecord
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.profile.schemas import AssistantProfileSnapshot, AssistantProfileUpdate
from app.modules.assistant.profile.service import AssistantProfileService
from app.modules.assistant.schemas import AssistantConversationChatRequest
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from app.modules.users.adapters import SqlAlchemyUserRepository
from app.modules.users.schemas import UserCreate
from tests.conftest import requires_db


def test_chat_request_accepts_minimal_profile_snapshot():
    request = AssistantConversationChatRequest(
        message="Lista todos mis productos",
        profile_version=2,
        profile_snapshot=AssistantProfileSnapshot(
            display_name="Luna",
            enabled_skill_ids=["menu_read"],
        ),
    )
    assert request.profile_snapshot is not None
    assert request.profile_snapshot.display_name == "Luna"
    assert request.profile_snapshot.enabled_skill_ids == ["menu_read"]


def _entitlements_record(
    restaurant_id: uuid.UUID,
    *,
    granted_skill_ids: list[str],
) -> RestaurantEntitlementsRecord:
    from datetime import UTC, datetime

    return RestaurantEntitlementsRecord(
        restaurant_id=restaurant_id,
        granted_skill_ids=granted_skill_ids,
        updated_at=datetime.now(UTC),
    )


def test_granted_skills_from_restaurant_entitlements():
    default = resolve_granted_skill_ids(None)
    assert default == set(DEFAULT_GRANTED_SKILL_IDS)

    custom = resolve_granted_skill_ids(
        _entitlements_record(uuid.uuid4(), granted_skill_ids=["menu_read", "menu_import"])
    )
    assert custom == set(DEFAULT_GRANTED_SKILL_IDS)


def test_effective_skills_all_granted_for_now():
    restaurant_id = uuid.uuid4()
    resolved = resolve_entitlements(
        enabled_skill_ids=["menu_read"],
        entitlements=_entitlements_record(
            restaurant_id,
            granted_skill_ids=["menu_read", "menu_import"],
        ),
    )
    assert resolved.effective_skill_ids == sorted(DEFAULT_GRANTED_SKILL_IDS)


@requires_db
def test_profile_create_and_update(session):
    user_repo = SqlAlchemyUserRepository(session)
    owner = user_repo.add(UserCreate(id=uuid.uuid4(), email="owner@test.com", plan="free"))

    rest_repo = SqlAlchemyRestaurantRepository(session)
    restaurant = rest_repo.add(
        RestaurantCreate(name="Tacos", subdomain="tacos-profile-test"),
        owner_id=owner.id,
    )

    svc = AssistantProfileService(
        SqlAlchemyAssistantProfileRepository(session),
        SqlAlchemyRestaurantEntitlementsRepository(session),
        rest_repo,
        cache=None,
    )
    profile = svc.get_profile_response(restaurant.id)
    assert profile.version == 1
    assert profile.chat_ready is False
    assert len(profile.skills_catalog) == len(SKILL_CATALOG)
    assert profile.granted_skill_ids == sorted(DEFAULT_GRANTED_SKILL_IDS)

    updated = svc.update_profile(
        restaurant.id,
        AssistantProfileUpdate(display_name="Luna", expected_version=profile.version),
    )
    assert updated.display_name == "Luna"
    assert updated.chat_ready is True
    assert updated.version == 2


@requires_db
def test_can_enable_any_catalog_skill(session):
    user_repo = SqlAlchemyUserRepository(session)
    owner = user_repo.add(UserCreate(id=uuid.uuid4(), email="free@test.com", plan="free"))

    rest_repo = SqlAlchemyRestaurantRepository(session)
    restaurant = rest_repo.add(
        RestaurantCreate(name="Free", subdomain="free-profile-test"),
        owner_id=owner.id,
    )

    svc = AssistantProfileService(
        SqlAlchemyAssistantProfileRepository(session),
        SqlAlchemyRestaurantEntitlementsRepository(session),
        rest_repo,
        cache=None,
    )
    profile = svc.get_profile_response(restaurant.id)

    updated = svc.update_profile(
        restaurant.id,
        AssistantProfileUpdate(
            enabled_skill_ids=["menu_import"],
            expected_version=profile.version,
        ),
    )
    assert "menu_import" in updated.enabled_skill_ids


@requires_db
def test_chat_ignores_snapshot_when_profile_version_is_stale(session):
    user_repo = SqlAlchemyUserRepository(session)
    owner = user_repo.add(UserCreate(id=uuid.uuid4(), email="stale@test.com", plan="free"))

    rest_repo = SqlAlchemyRestaurantRepository(session)
    restaurant = rest_repo.add(
        RestaurantCreate(name="Stale", subdomain="stale-profile-test"),
        owner_id=owner.id,
    )

    svc = AssistantProfileService(
        SqlAlchemyAssistantProfileRepository(session),
        SqlAlchemyRestaurantEntitlementsRepository(session),
        rest_repo,
        cache=None,
    )
    profile = svc.get_profile_response(restaurant.id)
    updated = svc.update_profile(
        restaurant.id,
        AssistantProfileUpdate(display_name="Luna", expected_version=profile.version),
    )

    record, effective = svc.resolve_profile_for_chat(
        restaurant.id,
        profile_version=profile.version,
        profile_snapshot=AssistantProfileSnapshot(
            display_name="Stale Snapshot",
            identity_markdown="# Stale Identity",
            behavior_markdown="# Stale Behavior",
            menu_markdown="# Stale Menu",
            enabled_skill_ids=["menu_import"],
        ),
    )

    assert updated.version > profile.version
    assert record.display_name == "Luna"
    assert "menu_import" in effective
