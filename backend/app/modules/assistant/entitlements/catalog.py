from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class SkillDefinition:
    id: str
    label: str


SKILL_CATALOG: dict[str, SkillDefinition] = {
    "menu_read": SkillDefinition(id="menu_read", label="Read menu"),
    "menu_write": SkillDefinition(id="menu_write", label="Edit menu"),
    "menu_best_practices": SkillDefinition(
        id="menu_best_practices",
        label="Menu best practices",
    ),
    "menu_media": SkillDefinition(id="menu_media", label="Menu photos"),
    "menu_intelligence": SkillDefinition(id="menu_intelligence", label="Menu intelligence"),
    # "business": SkillDefinition(id="business", label="Business settings"),
    "menu_import": SkillDefinition(id="menu_import", label="Import menu"),
    # "promotions": SkillDefinition(id="promotions", label="Promotions"),
}

# Por ahora: acceso completo al catálogo para tenants nuevos sin fila de entitlements.
DEFAULT_GRANTED_SKILL_IDS: tuple[str, ...] = tuple(sorted(SKILL_CATALOG.keys()))


def known_skill_ids() -> set[str]:
    return set(SKILL_CATALOG.keys())
