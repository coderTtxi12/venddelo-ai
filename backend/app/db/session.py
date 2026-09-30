from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings, normalize_db_url

__all__ = [
    "build_engine",
    "build_pooler_connect_args",
    "engine",
    "get_session",
    "is_pooled",
    "normalize_db_url",
]


def is_pooled(url: str) -> bool:
    return "pooler.supabase.com" in url or ":6543/" in url or url.endswith(":6543")


def build_pooler_connect_args() -> dict[str, object]:
    return {
        "prepare_threshold": None,
        "application_name": "venddelo-api",
        "options": " ".join(
            [
                "-c statement_timeout=120000",
                "-c lock_timeout=5000",
                "-c idle_in_transaction_session_timeout=15000",
            ]
        ),
    }


def build_engine(raw_url: str) -> Engine:
    url = normalize_db_url(raw_url)
    if is_pooled(url):
        return create_engine(
            url,
            connect_args=build_pooler_connect_args(),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=0,
            pool_timeout=10,
            pool_recycle=300,
            pool_use_lifo=True,
        )
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


engine = build_engine(get_settings().database_url)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
