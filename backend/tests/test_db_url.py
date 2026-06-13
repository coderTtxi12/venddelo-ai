from app.db.session import is_pooled, normalize_db_url


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
