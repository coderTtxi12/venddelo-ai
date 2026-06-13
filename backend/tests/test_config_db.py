from app.core.config import Settings


def test_database_url_default():
    settings = Settings()
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_database_url_test_optional():
    settings = Settings()
    assert settings.database_url_test is None or settings.database_url_test.startswith(
        "postgresql+psycopg://"
    )
