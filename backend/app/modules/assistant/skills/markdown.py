"""Load skill guides from ``SKILL.md`` files (progressive disclosure).

Each skill lives in ``skills/<skill_id>/`` with:
- ``SKILL.md`` — behavioral guide (optional YAML frontmatter + markdown body)
- ``tools.py`` — tool schemas and execution (Python only)

The agent receives a lightweight catalog in the system prompt and loads the full
guide on demand via the ``load_skill`` tool.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path


def skills_root() -> Path:
    return Path(__file__).resolve().parent


def skill_directory(skill_id: str) -> Path | None:
    directory = skills_root() / skill_id
    if not directory.is_dir():
        return None
    return directory


def skill_markdown_path(skill_id: str) -> Path | None:
    directory = skill_directory(skill_id)
    if directory is None:
        return None
    path = directory / "SKILL.md"
    return path if path.is_file() else None


def parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    """Split optional YAML-like frontmatter from the markdown body."""
    stripped = raw.lstrip()
    if not stripped.startswith("---"):
        return {}, raw
    closing = stripped.find("\n---", 3)
    if closing == -1:
        return {}, raw
    block = stripped[3:closing].strip()
    body = stripped[closing + 4 :].lstrip("\n")
    metadata: dict[str, str] = {}
    for line in block.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        key, sep, value = line.partition(":")
        if not sep:
            continue
        metadata[key.strip()] = value.strip().strip('"').strip("'")
    return metadata, body


@lru_cache
def _read_skill_file(skill_id: str) -> str | None:
    path = skill_markdown_path(skill_id)
    if path is None:
        return None
    return path.read_text(encoding="utf-8")


def load_skill_metadata(skill_id: str) -> dict[str, str]:
    """Frontmatter fields from ``SKILL.md`` (``name``, ``description``, …)."""
    raw = _read_skill_file(skill_id)
    if raw is None:
        return {}
    metadata, _ = parse_frontmatter(raw)
    return metadata


def load_skill_guide(skill_id: str) -> str | None:
    """Markdown body for ``load_skill`` (frontmatter stripped when present)."""
    raw = _read_skill_file(skill_id)
    if raw is None:
        return None
    _, body = parse_frontmatter(raw)
    guide = body.strip()
    return guide or None


def discover_skill_ids() -> list[str]:
    """Skill IDs that have a ``SKILL.md`` on disk."""
    root = skills_root()
    ids: list[str] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir() or entry.name.startswith(("_", ".")):
            continue
        if (entry / "SKILL.md").is_file():
            ids.append(entry.name)
    return ids


def skill_class_name(skill_id: str) -> str:
    """``menu_read`` → ``MenuReadSkill``."""
    return "".join(part.capitalize() for part in skill_id.split("_")) + "Skill"
