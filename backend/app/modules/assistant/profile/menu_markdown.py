"""Per-restaurant MENU knowledge markdown toggle.

Temporarily disabled: do not persist, load, or inject ``menu_markdown`` until
product re-enables custom menu knowledge blocks per restaurant.
"""

from __future__ import annotations

# Set True to restore DB + prompt wiring for menu_markdown.
MENU_MARKDOWN_ENABLED = True


def menu_markdown_for_runtime(stored: str) -> str:
    """Value exposed to API, chat snapshots, and prompt composition."""
    if MENU_MARKDOWN_ENABLED:
        return stored
    return ""


def menu_markdown_for_persist(incoming: str) -> str:
    """Value written on profile create/update."""
    if MENU_MARKDOWN_ENABLED:
        return incoming
    return ""
