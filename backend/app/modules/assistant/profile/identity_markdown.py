"""Per-restaurant IDENTITY markdown toggle.

Temporarily disabled: do not persist, load, or inject ``identity_markdown`` until
product re-enables custom identity blocks per restaurant.
"""

from __future__ import annotations

# Set True to restore DB + prompt wiring for identity_markdown.
IDENTITY_MARKDOWN_ENABLED = False


def identity_markdown_for_runtime(stored: str) -> str:
    """Value exposed to API, chat snapshots, and prompt composition."""
    if IDENTITY_MARKDOWN_ENABLED:
        return stored
    return ""


def identity_markdown_for_persist(incoming: str) -> str:
    """Value written on profile create/update."""
    if IDENTITY_MARKDOWN_ENABLED:
        return incoming
    return ""
