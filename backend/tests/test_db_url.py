from sqlalchemy.pool import NullPool, QueuePool

from app.db.session import build_engine, build_pooler_connect_args, is_pooled, normalize_db_url


def test_normalize_plain_postgresql_scheme():
    assert normalize_db_url("postgresql://u:p@h:6543/db") == ("postgresql+psycopg://u:p@h:6543/db")


def test_normalize_keeps_psycopg_scheme():
    url = "postgresql+psycopg://u:p@h:5432/db"
    assert normalize_db_url(url) == url


def test_is_pooled_detects_supabase_pooler():
    assert is_pooled("postgresql+psycopg://u:p@aws-1.pooler.supabase.com:6543/postgres")


def test_is_pooled_detects_port_6543():
    assert is_pooled("postgresql+psycopg://u:p@localhost:6543/db")


def test_is_pooled_false_for_local():
    assert not is_pooled("postgresql+psycopg://u:p@localhost:5434/vendelo")


def test_pooler_connect_args_set_timeouts_and_application_name():
    args = build_pooler_connect_args()

    assert args["prepare_threshold"] is None
    assert args["application_name"] == "venddelo-api"
    assert "statement_timeout=120000" in args["options"]
    assert "lock_timeout=5000" in args["options"]
    assert "idle_in_transaction_session_timeout=15000" in args["options"]


def test_pooler_engine_uses_nullpool():
    engine = build_engine(
        "postgresql+psycopg://user:password@aws-1.pooler.supabase.com:6543/postgres"
    )
    try:
        assert isinstance(engine.pool, NullPool)
    finally:
        engine.dispose()


def test_direct_postgres_engine_uses_queue_pool():
    engine = build_engine("postgresql+psycopg://u:p@localhost:5434/vendelo")
    try:
        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.size() == 5
    finally:
        engine.dispose()
