from __future__ import annotations

import uuid

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.infra.storage.supabase_storage import SupabaseStorageAdapter


def main() -> None:
    settings = get_settings()

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        count = conn.execute(
            text("SELECT count(*) FROM information_schema.tables " "WHERE table_schema = 'public'")
        ).scalar()
    print(f"DB OK - public tables: {count}")

    adapter = SupabaseStorageAdapter(settings)
    path = f"smoke/{uuid.uuid4()}.txt"
    obj = adapter.upload(path, b"hello", "text/plain")
    print(f"Storage upload OK - {obj.public_url}")
    adapter.delete(path)
    print("Storage delete OK")


if __name__ == "__main__":
    main()
