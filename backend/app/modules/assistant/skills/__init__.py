"""Assistant skills: markdown guides + Python tool executors."""

from app.modules.assistant.skills.discovery import discover_skill_executors
from app.modules.assistant.skills.registry import SkillRegistry


def build_skill_registry() -> SkillRegistry:
    """Registry wired from on-disk ``skills/*/`` directories."""
    return SkillRegistry(discover_skill_executors())
