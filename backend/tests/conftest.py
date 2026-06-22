import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

import app.db.models  # noqa: F401
from app.db.base import Base

TEST_URL = os.getenv(
    "DATABASE_URL_TEST",
    "postgresql+psycopg://vendelo:vendelo@localhost:5434/vendelo_test",
)


def _postgres_available(url: str) -> bool:
    try:
        eng = create_engine(url)
        with eng.connect():
            return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not _postgres_available(TEST_URL),
    reason="Postgres test database not available",
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_URL)
    Base.metadata.drop_all(eng)
    with eng.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def session(engine):
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    db: Session = session_factory()
    try:
        yield db
    finally:
        db.rollback()
        db.close()
