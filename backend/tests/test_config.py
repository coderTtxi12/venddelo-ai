from app.core.config import Settings, get_settings


def test_defaults():
    settings = Settings()
    assert settings.app_env == "dev"
    assert settings.api_v1_prefix == "/api/v1"
    assert settings.log_level == "INFO"


def test_env_override(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    settings = Settings()
    assert settings.app_env == "prod"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
