from functools import lru_cache
from pathlib import Path

_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


@lru_cache
def default_identity_markdown() -> str:
    return (_TEMPLATES_DIR / "default_identity.md").read_text(encoding="utf-8")


@lru_cache
def default_behavior_markdown() -> str:
    return (_TEMPLATES_DIR / "default_behavior.md").read_text(encoding="utf-8")


@lru_cache
def default_menu_markdown() -> str:
    return (_TEMPLATES_DIR / "default_menu.md").read_text(encoding="utf-8")
