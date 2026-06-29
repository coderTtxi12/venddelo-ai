"""Per-restaurant BEHAVIOR markdown toggle.

Temporarily disabled: do not persist, load, or inject ``behavior_markdown`` until
product re-enables custom behavior blocks per restaurant.
"""

from __future__ import annotations

# Set True to restore DB + prompt wiring for behavior_markdown.
BEHAVIOR_MARKDOWN_ENABLED = False


def behavior_markdown_for_runtime(stored: str) -> str:
    """Value exposed to API, chat snapshots, and prompt composition."""
    if BEHAVIOR_MARKDOWN_ENABLED:
        return stored
    return ""


def behavior_markdown_for_persist(incoming: str) -> str:
    """Value written on profile create/update."""
    if BEHAVIOR_MARKDOWN_ENABLED:
        return incoming
    return ""
