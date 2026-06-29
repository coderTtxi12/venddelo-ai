from __future__ import annotations

from dataclasses import dataclass

PLAN_ORDER: dict[str, int] = {
    "free": 0,
    "pro": 1,
    "enterprise": 2,
}


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    id: str
    label: str
    min_plan: str


SKILL_CATALOG: dict[str, SkillDefinition] = {
    "menu_read": SkillDefinition(id="menu_read", label="Read menu", min_plan="free"),
    "menu_write": SkillDefinition(id="menu_write", label="Edit menu", min_plan="free"),
    "business": SkillDefinition(id="business", label="Business settings", min_plan="free"),
    "menu_import": SkillDefinition(
        id="menu_import",
        label="Import menu",
        min_plan="pro",
    ),
    "promotions": SkillDefinition(id="promotions", label="Promotions", min_plan="pro"),
}


def skills_for_plan(plan: str) -> set[str]:
    plan_rank = PLAN_ORDER.get(plan, 0)
    return {
        skill.id
        for skill in SKILL_CATALOG.values()
        if PLAN_ORDER.get(skill.min_plan, 0) <= plan_rank
    }


def required_plan_for_skill(skill_id: str) -> str:
    skill = SKILL_CATALOG.get(skill_id)
    return skill.min_plan if skill else "enterprise"
