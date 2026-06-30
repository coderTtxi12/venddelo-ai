"""Discover skill tool executors from ``skills/<id>/tools.py`` modules."""

from __future__ import annotations

import importlib

from app.modules.assistant.skills.base import SkillPort
from app.modules.assistant.skills.markdown import (
    discover_skill_ids,
    skill_class_name,
    skill_directory,
)


def discover_skill_executors() -> list[SkillPort]:
    """Import every skill that has both ``SKILL.md`` and ``tools.py``."""
    executors: list[SkillPort] = []
    for skill_id in discover_skill_ids():
        directory = skill_directory(skill_id)
        if directory is None or not (directory / "tools.py").is_file():
            continue
        module = importlib.import_module(f"app.modules.assistant.skills.{skill_id}.tools")
        class_name = skill_class_name(skill_id)
        skill_cls = getattr(module, class_name, None)
        if skill_cls is None:
            raise ImportError(
                f"skills/{skill_id}/tools.py must define {class_name} for auto-discovery"
            )
        executor = skill_cls()
        if getattr(executor, "id", None) != skill_id:
            raise ValueError(
                f"{class_name}.id must be {skill_id!r}, got {getattr(executor, 'id', None)!r}"
            )
        executors.append(executor)
    return executors
