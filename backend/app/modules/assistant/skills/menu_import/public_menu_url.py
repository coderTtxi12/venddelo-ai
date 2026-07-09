"""Build the owner-facing public digital menu URL."""

from __future__ import annotations

from app.core.config import Settings


def build_public_menu_url(subdomain: str, *, settings: Settings) -> str:
    normalized = subdomain.strip().lower()
    if not normalized:
        return ""

    domain = settings.menu_public_domain.strip()
    if domain.endswith(".vercel.app") or settings.app_env == "dev":
        base = settings.cors_origins.split(",")[0].strip() or "http://localhost:3000"
        return f"{base.rstrip('/')}/menu/{normalized}"

    return f"https://{normalized}.{domain}"
