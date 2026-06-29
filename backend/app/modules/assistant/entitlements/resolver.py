from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.modules.assistant.entitlements.catalog import (
    SKILL_CATALOG,
    SkillDefinition,
    skills_for_plan,
)
from app.modules.assistant.entitlements.schemas import EntitlementOverridesRecord
from app.modules.assistant.profile.schemas import SkillCatalogEntryDTO


@dataclass(frozen=True, slots=True)
class ResolvedEntitlements:
    owner_plan: str
    granted_skill_ids: list[str]
    effective_skill_ids: list[str]
    skills_catalog: list[SkillCatalogEntryDTO]


def _overrides_active(overrides: EntitlementOverridesRecord | None) -> bool:
    if overrides is None:
        return False
    if overrides.expires_at is None:
        return True
    return overrides.expires_at > datetime.now(UTC)


def resolve_granted_skill_ids(
    owner_plan: str,
    overrides: EntitlementOverridesRecord | None,
) -> set[str]:
    granted = skills_for_plan(owner_plan)
    if _overrides_active(overrides):
        granted |= set(overrides.granted_extra or [])
        granted -= set(overrides.revoked or [])
    return granted


def resolve_effective_skill_ids(granted: set[str], enabled: list[str]) -> list[str]:
    enabled_set = set(enabled)
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
            lock_reason = "upgrade_required"
        catalog.append(
            SkillCatalogEntryDTO(
                id=skill_id,
                label=skill.label,
                granted=is_granted,
                enabled=skill_id in enabled_set,
                effective=skill_id in effective_set,
                required_plan=skill.min_plan,
                lock_reason=lock_reason,
            )
        )
    return catalog


def resolve_entitlements(
    *,
    owner_plan: str,
    enabled_skill_ids: list[str],
    overrides: EntitlementOverridesRecord | None,
) -> ResolvedEntitlements:
    granted = resolve_granted_skill_ids(owner_plan, overrides)
    effective = resolve_effective_skill_ids(granted, enabled_skill_ids)
    return ResolvedEntitlements(
        owner_plan=owner_plan,
        granted_skill_ids=sorted(granted),
        effective_skill_ids=effective,
        skills_catalog=build_skills_catalog(granted, enabled_skill_ids, effective),
    )


def validate_enabled_subset(enabled_skill_ids: list[str], granted: set[str]) -> list[str]:
    """Return skill IDs that are enabled but not granted."""
    return sorted(set(enabled_skill_ids) - granted)
