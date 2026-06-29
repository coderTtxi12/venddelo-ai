import uuid

import pytest

from app.modules.assistant.entitlements.catalog import SKILL_CATALOG
from app.modules.assistant.entitlements.resolver import resolve_entitlements, resolve_granted_skill_ids
from app.modules.assistant.profile.service import AssistantProfileService
from app.modules.assistant.profile.schemas import AssistantProfileSnapshot, AssistantProfileUpdate
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.entitlements.adapters import SqlAlchemyEntitlementOverridesRepository
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate
from app.modules.users.adapters import SqlAlchemyUserRepository
from app.modules.users.schemas import UserCreate
from tests.conftest import requires_db


@requires_db
def test_granted_skills_by_plan(session):
    free = resolve_granted_skill_ids("free", None)
    assert "menu_read" in free
    assert "menu_import" not in free

    pro = resolve_granted_skill_ids("pro", None)
    assert "menu_import" in pro


@requires_db
def test_effective_skills_intersection(session):
    resolved = resolve_entitlements(
        owner_plan="pro",
        enabled_skill_ids=["menu_read", "menu_import", "promotions"],
        overrides=None,
    )
    assert set(resolved.effective_skill_ids).issubset(set(resolved.granted_skill_ids))
    assert "menu_read" in resolved.effective_skill_ids


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
        SqlAlchemyEntitlementOverridesRepository(session),
        rest_repo,
        user_repo,
        cache=None,
    )
    profile = svc.get_profile_response(restaurant.id)
    assert profile.version == 1
    assert profile.chat_ready is False
    assert len(profile.skills_catalog) == len(SKILL_CATALOG)

    updated = svc.update_profile(
        restaurant.id,
        AssistantProfileUpdate(display_name="Luna", expected_version=profile.version),
    )
    assert updated.display_name == "Luna"
    assert updated.chat_ready is True
    assert updated.version == 2


@requires_db
def test_cannot_enable_skill_not_granted(session):
    user_repo = SqlAlchemyUserRepository(session)
    owner = user_repo.add(UserCreate(id=uuid.uuid4(), email="free@test.com", plan="free"))

    rest_repo = SqlAlchemyRestaurantRepository(session)
    restaurant = rest_repo.add(
        RestaurantCreate(name="Free", subdomain="free-profile-test"),
        owner_id=owner.id,
    )

    svc = AssistantProfileService(
        SqlAlchemyAssistantProfileRepository(session),
        SqlAlchemyEntitlementOverridesRepository(session),
        rest_repo,
        user_repo,
        cache=None,
    )
    profile = svc.get_profile_response(restaurant.id)

    from app.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        svc.update_profile(
            restaurant.id,
            AssistantProfileUpdate(
                enabled_skill_ids=["menu_import"],
                expected_version=profile.version,
            ),
        )


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
        SqlAlchemyEntitlementOverridesRepository(session),
        rest_repo,
        user_repo,
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
    assert "menu_import" not in effective
