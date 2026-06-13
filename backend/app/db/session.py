from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings, normalize_db_url

__all__ = ["build_engine", "engine", "get_session", "is_pooled", "normalize_db_url"]


def is_pooled(url: str) -> bool:
    return "pooler.supabase.com" in url or ":6543/" in url or url.endswith(":6543")


def build_engine(raw_url: str) -> Engine:
    url = normalize_db_url(raw_url)
    if is_pooled(url):
        return create_engine(
            url,
            poolclass=NullPool,
            connect_args={"prepare_threshold": None},
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
