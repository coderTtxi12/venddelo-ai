from app.core.config import Settings
from app.modules.assistant.skills.menu_import.public_menu_url import build_public_menu_url


def test_public_menu_url_dev_uses_subdomain_localhost():
    settings = Settings(app_env="dev", cors_origins="http://localhost:3000")
    url = build_public_menu_url("tacos-centro", settings=settings)
    assert url == "http://tacos-centro.localhost:3000"


def test_public_menu_url_production_uses_subdomain():
    settings = Settings(app_env="production", menu_public_domain="mxy.mx")
    url = build_public_menu_url("wild-rooster", settings=settings)
    assert url == "https://wild-rooster.mxy.mx"


def test_public_menu_url_vercel_uses_path_routing():
    settings = Settings(
        app_env="production",
        menu_public_domain="venddelo-ai.vercel.app",
        cors_origins="https://venddelo-ai.vercel.app",
    )
    url = build_public_menu_url("wild-rooster", settings=settings)
    assert url == "https://venddelo-ai.vercel.app/menu/wild-rooster"
