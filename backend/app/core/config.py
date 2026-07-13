from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_db_url(url: str) -> str:
    """Force the psycopg v3 driver (psycopg2 is not installed).

    Supabase connection strings use the bare ``postgresql://`` scheme, which
    SQLAlchemy maps to psycopg2 by default. Rewrite it to ``postgresql+psycopg://``.
    """
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


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
    database_url: str = "postgresql+psycopg://vendelo:vendelo@localhost:5434/vendelo"
    database_url_test: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "assets"
    supabase_jwt_secret: str | None = None
    jwt_audience: str = "authenticated"
    order_idempotency_ttl_seconds: int = 86400
    redis_url: str | None = None
    menu_cache_ttl_seconds: int = 300
    assistant_conversation_cache_ttl_seconds: int = 300
    assistant_profile_cache_ttl_seconds: int = 3600
    assistant_lane_lock_ttl_seconds: int = 600
    assistant_llm_context_message_limit: int = 40
    assistant_router_llm_context_message_limit: int = 12
    assistant_context_compression_enabled: bool = True
    assistant_context_max_tokens: int = 8000
    assistant_context_compression_threshold_ratio: float = 0.70
    assistant_context_recent_window_turns: int = 6
    assistant_context_compression_model: str | None = None
    assistant_context_compression_max_output_tokens: int = 1500
    assistant_max_tool_iterations: int = 32
    menu_import_batch_max_products: int = 15
    menu_import_full_max_products: int = 200
    menu_import_photo_match_confidence_threshold: float = Field(
        default=0.72,
        validation_alias="MENU_IMPORT_PHOTO_MATCH_THRESHOLD",
    )
    menu_import_max_source_bytes: int = 15 * 1024 * 1024
    menu_import_max_photo_bytes: int = 5 * 1024 * 1024
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60
    openai_api_key: str | None = None
    openai_model: str = "gpt-5-nano-2025-08-07"
    openai_image_model: str = "gpt-image-2"
    openai_vision_model: str = Field(
        default="gpt-5.4-nano-2026-03-17",
        validation_alias="OPENAI_VISION_MODEL",
    )
    llm_provider: str = "stub"
    image_provider: str = "openai"
    vision_provider: str = "openai"
    langsmith_tracing: bool = False
    langsmith_api_key: str | None = None
    langsmith_project: str = "venddelo-ai"
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    google_maps_api_key: str | None = None
    translation_cache_ttl_seconds: int = 3600
    cors_origins: str = "http://localhost:3000"
    menu_public_domain: str = "mxy.mx"

    @field_validator("database_url", "database_url_test")
    @classmethod
    def _normalize_db_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_db_url(value)


@lru_cache
def get_settings() -> Settings:
    from app.infra.llm.tracing import configure_langsmith_env

    settings = Settings()
    configure_langsmith_env(settings)
    return settings
