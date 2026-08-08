"""Accessibility / ARIA snapshots for the Facebook browser agent."""

from __future__ import annotations

from typing import Any

# Keep prompts bounded for the LLM.
DEFAULT_SNAPSHOT_MAX_CHARS = 12_000


async def capture_aria_snapshot(
    page: Any,
    *,
    max_chars: int = DEFAULT_SNAPSHOT_MAX_CHARS,
) -> str:
    """Return a truncated ARIA snapshot of the page body plus URL."""
    url = getattr(page, "url", "") or ""
    try:
        raw = await page.locator("body").aria_snapshot()
    except Exception as exc:
        raw = f"(aria_snapshot failed: {exc})"
    text = raw if isinstance(raw, str) else str(raw)
    if len(text) > max_chars:
        text = text[: max_chars - 20] + "\n...[truncated]..."
    return f"URL: {url}\n\n{text}"
