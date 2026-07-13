"""Assistant profile and entitlements resolution for the agent runtime.

Loads and updates per-restaurant assistant persona data from
``restaurant_assistant_profiles`` (identity, behavior, menu markdown, enabled skills)
and combines it with ``restaurant_assistant_entitlements`` (skills granted per tenant)
to produce ``granted`` and ``effective`` skill sets.

Profile rows are cached in Redis; entitlements are read from Postgres on each resolve.
Repositories are injected — ``restaurant_id`` is passed per method call, not at construct time.
"""

from __future__ import annotations

import uuid

from app.core.config import Settings, get_settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.infra.redis.factory import build_cache
from app.modules.assistant.entitlements.adapters import SqlAlchemyRestaurantEntitlementsRepository
from app.modules.assistant.entitlements.catalog import DEFAULT_GRANTED_SKILL_IDS
from app.modules.assistant.entitlements.resolver import (
    resolve_entitlements,
    resolve_granted_skill_ids,
    validate_enabled_subset,
)
from app.modules.assistant.profile.adapters import SqlAlchemyAssistantProfileRepository
from app.modules.assistant.profile.behavior_markdown import behavior_markdown_for_runtime
from app.modules.assistant.profile.cache import AssistantProfileCache
from app.modules.assistant.profile.identity_markdown import identity_markdown_for_runtime
from app.modules.assistant.profile.menu_markdown import menu_markdown_for_runtime
from app.modules.assistant.profile.schemas import (
    AssistantProfileRecord,
    AssistantProfileResponse,
    AssistantProfileSnapshot,
    AssistantProfileUpdate,
)

# from app.modules.assistant.profile.template_loader import (
#     default_behavior_markdown,
#     default_identity_markdown,
#     default_menu_markdown,
# )
from app.modules.restaurants.repository import RestaurantRepository


class AssistantProfileService:
    """Resolve assistant profile + entitlements for API and chat turns."""

    def __init__(
        self,
        profile_repo: SqlAlchemyAssistantProfileRepository,
        entitlement_repo: SqlAlchemyRestaurantEntitlementsRepository,
        restaurant_repo: RestaurantRepository,
        *,
        cache: AssistantProfileCache | None = None,
        settings: Settings | None = None,
    ) -> None:
        """Wire repositories and optional Redis profile cache (one row per restaurant)."""
        self._profile_repo = profile_repo
        self._entitlement_repo = entitlement_repo
        self._restaurant_repo = restaurant_repo
        self._settings = settings or get_settings()
        self._cache = cache or AssistantProfileCache(build_cache(self._settings), self._settings)

    @staticmethod
    def _profile_for_runtime(record: AssistantProfileRecord) -> AssistantProfileRecord:
        """Strip disabled markdown fields (Redis may hold stale cached values)."""
        updates: dict[str, str] = {}
        cleared_behavior = behavior_markdown_for_runtime(record.behavior_markdown)
        if cleared_behavior != record.behavior_markdown:
            updates["behavior_markdown"] = cleared_behavior
        cleared_identity = identity_markdown_for_runtime(record.identity_markdown)
        if cleared_identity != record.identity_markdown:
            updates["identity_markdown"] = cleared_identity
        cleared_menu = menu_markdown_for_runtime(record.menu_markdown)
        if cleared_menu != record.menu_markdown:
            updates["menu_markdown"] = cleared_menu
        if not updates:
            return record
        return record.model_copy(update=updates)

    def _entitlements_for_restaurant(self, restaurant_id: uuid.UUID):
        """Load per-restaurant skill grants; create defaults on first access."""
        return self._entitlement_repo.get_or_create_default(
            restaurant_id,
            granted_skill_ids=list(DEFAULT_GRANTED_SKILL_IDS),
            source="default",
        )

    def get_or_create(self, restaurant_id: uuid.UUID) -> AssistantProfileRecord:
        """Load profile by PK; create defaults from templates if missing.

        Reads Redis first, then ``restaurant_assistant_profiles`` (single row).
        """
        cached = self._cache.get(restaurant_id)
        if cached is not None:
            return self._profile_for_runtime(cached)

        existing = self._profile_repo.get(restaurant_id)
        if existing is not None:
            record = self._profile_for_runtime(existing)
            self._cache.set(restaurant_id, record)
            return record

        entitlements = self._entitlements_for_restaurant(restaurant_id)
        enabled = sorted(set(resolve_granted_skill_ids(entitlements)) | {"menu_import"})
        created = self._profile_repo.create(
            restaurant_id=restaurant_id,
            # identity_markdown=default_identity_markdown(),
            identity_markdown=identity_markdown_for_runtime(""),
            # behavior_markdown=default_behavior_markdown(),
            behavior_markdown=behavior_markdown_for_runtime(""),
            menu_markdown=menu_markdown_for_runtime(""),
            enabled_skill_ids=enabled,
        )
        record = self._profile_for_runtime(created)
        self._cache.set(restaurant_id, record)
        return record

    def get_profile_response(self, restaurant_id: uuid.UUID) -> AssistantProfileResponse:
        """GET profile API shape: record + granted/effective skills + catalog + ``chat_ready``."""
        record = self.get_or_create(restaurant_id)
        entitlements = self._entitlements_for_restaurant(restaurant_id)
        resolved = resolve_entitlements(
            enabled_skill_ids=record.enabled_skill_ids,
            entitlements=entitlements,
        )
        display_name = record.display_name.strip()
        return AssistantProfileResponse(
            restaurant_id=record.restaurant_id,
            display_name=display_name,
            identity_markdown=identity_markdown_for_runtime(record.identity_markdown),
            # behavior_markdown=record.behavior_markdown,
            behavior_markdown=behavior_markdown_for_runtime(record.behavior_markdown),
            menu_markdown=menu_markdown_for_runtime(record.menu_markdown),
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
        """PATCH profile with optimistic concurrency (``expected_version``).

        Rejects ``enabled_skill_ids`` not in the granted set for this restaurant.
        """
        record = self.get_or_create(restaurant_id)
        entitlements = self._entitlements_for_restaurant(restaurant_id)
        granted = resolve_entitlements(
            enabled_skill_ids=record.enabled_skill_ids,
            entitlements=entitlements,
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
            identity_markdown=None,
            # behavior_markdown=data.behavior_markdown,
            behavior_markdown=None,
            menu_markdown=None,
            enabled_skill_ids=data.enabled_skill_ids,
        )
        if updated is None:
            raise ConflictError("Profile version mismatch — refresh and retry")

        self._cache.set(restaurant_id, self._profile_for_runtime(updated))
        return self.get_profile_response(restaurant_id)

    def resolve_profile_for_chat(
        self,
        restaurant_id: uuid.UUID,
        *,
        profile_version: int,
        profile_snapshot: AssistantProfileSnapshot | None,
    ) -> tuple[AssistantProfileRecord, list[str]]:
        """Build prompt profile + effective skills for one chat turn.

        Uses ``profile_snapshot`` for prompt fields only when ``profile_version`` matches
        the server record. Entitlements are always recomputed server-side from
        ``restaurant_assistant_entitlements``. Requires non-empty ``display_name``.
        """
        record = self.get_or_create(restaurant_id)
        if record.version == profile_version and profile_snapshot is not None:
            snapshot_update = {
                "display_name": profile_snapshot.display_name,
                # "menu_markdown": profile_snapshot.menu_markdown,
                "enabled_skill_ids": profile_snapshot.enabled_skill_ids,
            }
            # snapshot_update["behavior_markdown"] = profile_snapshot.behavior_markdown
            record = record.model_copy(update=snapshot_update)

        record = self._profile_for_runtime(record)

        if not record.display_name.strip():
            raise ValidationError(
                "Configure el nombre del asistente antes de iniciar una conversación"
            )

        entitlements = self._entitlements_for_restaurant(restaurant_id)
        effective = resolve_entitlements(
            enabled_skill_ids=record.enabled_skill_ids,
            entitlements=entitlements,
        ).effective_skill_ids
        return record, effective

    def assert_restaurant_exists(self, restaurant_id: uuid.UUID) -> None:
        """Raise ``NotFoundError`` when the restaurant row does not exist."""
        if self._restaurant_repo.get(restaurant_id) is None:
            raise NotFoundError("Restaurant not found")
