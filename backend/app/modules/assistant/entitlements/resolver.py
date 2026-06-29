from __future__ import annotations

from dataclasses import dataclass

from app.modules.assistant.entitlements.catalog import (
    DEFAULT_GRANTED_SKILL_IDS,
    SKILL_CATALOG,
    SkillDefinition,
    known_skill_ids,
)
from app.modules.assistant.entitlements.schemas import RestaurantEntitlementsRecord
from app.modules.assistant.profile.schemas import SkillCatalogEntryDTO


@dataclass(frozen=True, slots=True)
class ResolvedEntitlements:
    granted_skill_ids: list[str]
    effective_skill_ids: list[str]
    skills_catalog: list[SkillCatalogEntryDTO]


def _normalize_skill_ids(skill_ids: list[str]) -> list[str]:
    known = known_skill_ids()
    return sorted({skill_id for skill_id in skill_ids if skill_id in known})


def resolve_granted_skill_ids(
    entitlements: RestaurantEntitlementsRecord | None,
) -> set[str]:
    """Return skills granted to this restaurant (configured per tenant, not by billing plan)."""
    if entitlements is None or not entitlements.is_active:
        return set(DEFAULT_GRANTED_SKILL_IDS)
    return set(_normalize_skill_ids(entitlements.granted_skill_ids))


def resolve_effective_skill_ids(granted: set[str], enabled: list[str]) -> list[str]:
    enabled_set = set(_normalize_skill_ids(enabled))
    return sorted(granted & enabled_set)


def build_skills_catalog(
    granted: set[str],
    enabled: list[str],
    effective: list[str],
) -> list[SkillCatalogEntryDTO]:
    enabled_set = set(enabled)
    effective_set = set(effective)
    catalog: list[SkillCatalogEntryDTO] = []
    for skill_id in sorted(SKILL_CATALOG.keys(), key=lambda sid: SKILL_CATALOG[sid].label):
        skill: SkillDefinition = SKILL_CATALOG[skill_id]
        is_granted = skill_id in granted
        lock_reason: str | None = None
        if not is_granted:
            lock_reason = "not_granted"
        catalog.append(
            SkillCatalogEntryDTO(
                id=skill_id,
                label=skill.label,
                granted=is_granted,
                enabled=skill_id in enabled_set,
                effective=skill_id in effective_set,
                lock_reason=lock_reason,
            )
        )
    return catalog


def resolve_entitlements(
    *,
    enabled_skill_ids: list[str],
    entitlements: RestaurantEntitlementsRecord | None,
) -> ResolvedEntitlements:
    granted = resolve_granted_skill_ids(entitlements)
    effective = resolve_effective_skill_ids(granted, enabled_skill_ids)
    return ResolvedEntitlements(
        granted_skill_ids=sorted(granted),
        effective_skill_ids=effective,
        skills_catalog=build_skills_catalog(granted, enabled_skill_ids, effective),
    )


def validate_enabled_subset(enabled_skill_ids: list[str], granted: set[str]) -> list[str]:
    """Return skill IDs that are enabled but not granted."""
    return sorted(set(_normalize_skill_ids(enabled_skill_ids)) - granted)
