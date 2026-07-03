#!/usr/bin/env python3
"""Sync digital menu themes from JSON export into Postgres."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.db.session import SessionLocal
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRepository

DEFAULT_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "digital_menu_themes.json"


def sync_digital_menu_themes(session, json_path: Path = DEFAULT_JSON_PATH) -> int:
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("digital_menu_themes.json must be a JSON array")

    repo = DigitalMenuThemeRepository(session)
    for entry in payload:
        if not isinstance(entry, dict) or "id" not in entry:
            raise ValueError("each theme entry must be an object with an id")
        repo.upsert(entry)
    return len(payload)


def main() -> int:
    json_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_JSON_PATH
    if not json_path.is_file():
        print(f"Theme JSON not found: {json_path}", file=sys.stderr)
        return 1

    session = SessionLocal()
    try:
        count = sync_digital_menu_themes(session, json_path)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print(f"Synced {count} digital menu theme(s) from {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
