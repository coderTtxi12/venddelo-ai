"""Build the owner-facing public digital menu URL."""

from __future__ import annotations

from urllib.parse import urlparse

from app.core.config import Settings


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
