from __future__ import annotations

import uuid

from app.core.config import Settings, get_settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.infra.redis.factory import build_cache
from app.modules.assistant.entitlements.adapters import SqlAlchemyEntitlementOverridesRepository
from app.modules.assistant.entitlements.resolver import (
    resolve_entitlements,
    resolve_granted_skill_ids,
    validate_enabled_subset,
)
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.profile.cache import AssistantProfileCache
from app.modules.assistant.profile.schemas import (
    AssistantProfileRecord,
    AssistantProfileResponse,
    AssistantProfileSnapshot,
    AssistantProfileUpdate,
)
from app.modules.assistant.profile.template_loader import (
    default_behavior_markdown,
    default_identity_markdown,
    default_menu_markdown,
)
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.users.repository import UserRepository


class AssistantProfileService:
    def __init__(
        self,
        profile_repo: SqlAlchemyAssistantProfileRepository,
        entitlement_repo: SqlAlchemyEntitlementOverridesRepository,
        restaurant_repo: RestaurantRepository,
        user_repo: UserRepository,
        *,
        cache: AssistantProfileCache | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._profile_repo = profile_repo
        self._entitlement_repo = entitlement_repo
        self._restaurant_repo = restaurant_repo
        self._user_repo = user_repo
        self._settings = settings or get_settings()
        self._cache = cache or AssistantProfileCache(build_cache(self._settings), self._settings)

    def _owner_plan(self, restaurant_id: uuid.UUID) -> str:
        restaurant = self._restaurant_repo.get(restaurant_id)
        if restaurant is None or restaurant.owner_id is None:
            return "free"
        owner = self._user_repo.get(restaurant.owner_id)
        return owner.plan if owner else "free"

    def _default_enabled(self, owner_plan: str) -> list[str]:
        granted = resolve_granted_skill_ids(owner_plan, None)
        return sorted(granted)

    def get_or_create(self, restaurant_id: uuid.UUID) -> AssistantProfileRecord:
        cached = self._cache.get(restaurant_id)
        if cached is not None:
            return cached

        existing = self._profile_repo.get(restaurant_id)
        if existing is not None:
            self._cache.set(restaurant_id, existing)
            return existing

        owner_plan = self._owner_plan(restaurant_id)
        enabled = self._default_enabled(owner_plan)
        created = self._profile_repo.create(
            restaurant_id=restaurant_id,
            identity_markdown=default_identity_markdown(),
            behavior_markdown=default_behavior_markdown(),
            menu_markdown=default_menu_markdown(),
            enabled_skill_ids=enabled,
        )
        self._cache.set(restaurant_id, created)
        return created

    def get_profile_response(self, restaurant_id: uuid.UUID) -> AssistantProfileResponse:
        record = self.get_or_create(restaurant_id)
        owner_plan = self._owner_plan(restaurant_id)
        overrides = self._entitlement_repo.get(restaurant_id)
        resolved = resolve_entitlements(
            owner_plan=owner_plan,
            enabled_skill_ids=record.enabled_skill_ids,
            overrides=overrides,
        )
        display_name = record.display_name.strip()
        return AssistantProfileResponse(
            restaurant_id=record.restaurant_id,
            display_name=display_name,
            identity_markdown=record.identity_markdown,
            behavior_markdown=record.behavior_markdown,
            menu_markdown=record.menu_markdown,
            enabled_skill_ids=record.enabled_skill_ids,
            granted_skill_ids=resolved.granted_skill_ids,
            effective_skill_ids=resolved.effective_skill_ids,
            skills_catalog=resolved.skills_catalog,
            version=record.version,
            chat_ready=bool(display_name),
            updated_at=record.updated_at,
        )

    def update_profile(
        self,
        restaurant_id: uuid.UUID,
        data: AssistantProfileUpdate,
    ) -> AssistantProfileResponse:
        record = self.get_or_create(restaurant_id)
        owner_plan = self._owner_plan(restaurant_id)
        overrides = self._entitlement_repo.get(restaurant_id)
        granted = resolve_entitlements(
            owner_plan=owner_plan,
            enabled_skill_ids=record.enabled_skill_ids,
            overrides=overrides,
        ).granted_skill_ids

        if data.enabled_skill_ids is not None:
            blocked = validate_enabled_subset(data.enabled_skill_ids, set(granted))
            if blocked:
                raise ValidationError(
                    f"Skills not granted for this restaurant: {', '.join(blocked)}"
                )

        if data.display_name is not None and not data.display_name.strip():
            raise ValidationError("display_name cannot be empty when provided")

        updated = self._profile_repo.update(
            restaurant_id,
            expected_version=data.expected_version,
            display_name=data.display_name.strip() if data.display_name is not None else None,
            identity_markdown=data.identity_markdown,
            behavior_markdown=data.behavior_markdown,
            menu_markdown=data.menu_markdown,
            enabled_skill_ids=data.enabled_skill_ids,
        )
        if updated is None:
            raise ConflictError("Profile version mismatch — refresh and retry")

        self._cache.set(restaurant_id, updated)
        return self.get_profile_response(restaurant_id)

    def resolve_profile_for_chat(
        self,
        restaurant_id: uuid.UUID,
        *,
        profile_version: int,
        profile_snapshot: AssistantProfileSnapshot | None,
    ) -> tuple[AssistantProfileRecord, list[str]]:
        record = self.get_or_create(restaurant_id)
        if record.version == profile_version and profile_snapshot is not None:
            record = record.model_copy(
                update={
                    "display_name": profile_snapshot.display_name,
                    "identity_markdown": profile_snapshot.identity_markdown,
                    "behavior_markdown": profile_snapshot.behavior_markdown,
                    "menu_markdown": profile_snapshot.menu_markdown,
                    "enabled_skill_ids": profile_snapshot.enabled_skill_ids,
                }
            )

        if not record.display_name.strip():
            raise ValidationError(
                "Configure el nombre del asistente antes de iniciar una conversación"
            )

        owner_plan = self._owner_plan(restaurant_id)
        overrides = self._entitlement_repo.get(restaurant_id)
        effective = resolve_entitlements(
            owner_plan=owner_plan,
            enabled_skill_ids=record.enabled_skill_ids,
            overrides=overrides,
        ).effective_skill_ids
        return record, effective

    def assert_restaurant_exists(self, restaurant_id: uuid.UUID) -> None:
        if self._restaurant_repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
