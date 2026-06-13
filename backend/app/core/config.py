from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "dev"
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"
    app_version: str = "0.1.0"
    database_url: str = "postgresql+psycopg://vendelo:vendelo@localhost:5433/vendelo"
    database_url_test: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
