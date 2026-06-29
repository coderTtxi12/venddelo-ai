from __future__ import annotations

from dataclasses import dataclass

# Skills granted when no entitlements row exists yet (minimal safe default).
DEFAULT_GRANTED_SKILL_IDS: tuple[str, ...] = ("menu_read",)


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    id: str
    label: str


SKILL_CATALOG: dict[str, SkillDefinition] = {
    "menu_read": SkillDefinition(id="menu_read", label="Read menu"),
    "menu_write": SkillDefinition(id="menu_write", label="Edit menu"),
    "business": SkillDefinition(id="business", label="Business settings"),
    "menu_import": SkillDefinition(id="menu_import", label="Import menu"),
    "promotions": SkillDefinition(id="promotions", label="Promotions"),
}


def known_skill_ids() -> set[str]:
    return set(SKILL_CATALOG.keys())
