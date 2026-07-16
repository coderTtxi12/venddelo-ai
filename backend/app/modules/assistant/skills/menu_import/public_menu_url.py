"""Build the owner-facing public digital menu URL."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from app.core.config import Settings

MENU_IMPORT_APPLY_TOOL_NAMES = frozenset(
    {
        "model_working_draft",
        "start_menu_extraction_batch",
        "apply_full_import",
    }
)


def import_session_applied_to_live(session: Any | None) -> bool:
    if session is None:
        return False
    batches = session.draft_batches or []
    return any(isinstance(entry, dict) and entry.get("applied_at") for entry in batches)


def should_inject_public_menu_url_for_responder(
    session: Any | None,
    *,
    pending_quiz: bool,
    execution_status: str,
    tools_used: list[str] | None = None,
) -> bool:
    """Inject the public menu link when apply finished and the owner can view the live menu."""
    if pending_quiz:
        return False
    if not import_session_applied_to_live(session):
        return False
    if execution_status not in {"success", "partial_success"}:
        return False
    if tools_used:
        return bool(MENU_IMPORT_APPLY_TOOL_NAMES.intersection(tools_used))
    return False


def format_public_menu_link_block(public_menu_url: str) -> str:
    return (
        "## Public menu link\n\n"
        "Include this URL in `message` so the owner can open their digital menu:\n\n"
        f"{public_menu_url.strip()}"
    )


def _dev_subdomain_menu_url(subdomain: str, base_url: str) -> str:
    parsed = urlparse(base_url.rstrip("/") or "http://localhost:3000")
    port_suffix = f":{parsed.port}" if parsed.port else ""
    scheme = parsed.scheme or "http"
    return f"{scheme}://{subdomain}.localhost{port_suffix}"


def build_public_menu_url(subdomain: str, *, settings: Settings) -> str:
    normalized = subdomain.strip().lower()
    if not normalized:
        return ""

    domain = settings.menu_public_domain.strip()
    if domain.endswith(".vercel.app"):
        base = settings.cors_origins.split(",")[0].strip() or "http://localhost:3000"
        return f"{base.rstrip('/')}/menu/{normalized}"

    if settings.app_env == "dev":
        base = settings.cors_origins.split(",")[0].strip() or "http://localhost:3000"
        return _dev_subdomain_menu_url(normalized, base)

    return f"https://{normalized}.{domain}"
