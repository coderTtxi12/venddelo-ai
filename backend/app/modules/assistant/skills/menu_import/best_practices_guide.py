"""Local copy of the menu best-practices guide for menu_import."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.modules.assistant.skills.markdown import parse_frontmatter

_GUIDE_PATH = Path(__file__).resolve().parent / "menu_best_practices.md"


@lru_cache
def load_menu_best_practices_guide() -> str | None:
    if not _GUIDE_PATH.is_file():
        return None
    raw = _GUIDE_PATH.read_text(encoding="utf-8")
    _, body = parse_frontmatter(raw)
    guide = body.strip()
    return guide or None
