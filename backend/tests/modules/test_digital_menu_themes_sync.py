import json

from sqlalchemy import select

from app.db.models.digital_menu_theme import DigitalMenuTheme
from app.modules.digital_menu_themes.repository import DigitalMenuThemeRepository
from scripts.sync_digital_menu_themes import sync_digital_menu_themes
from tests.conftest import requires_db


@requires_db
def test_sync_upserts_theme(session, tmp_path):
    fixture = [
        {
            "id": "original",
            "label": "Original",
            "description": "Neutral default theme.",
            "bestFor": ["Any restaurant"],
            "recommendation": "Start here.",
            "style_keywords": ["neutral", "clean"],
            "is_active": True,
            "sort_order": 0,
        },
        {
            "id": "taqueria-viva",
            "label": "Taquería",
            "description": "Warm taqueria theme.",
            "bestFor": ["Taquería"],
            "recommendation": "Mexican street food menus.",
            "style_keywords": ["playful", "warm"],
            "is_active": True,
            "sort_order": 1,
        },
    ]
    json_path = tmp_path / "digital_menu_themes.json"
    json_path.write_text(json.dumps(fixture), encoding="utf-8")

    count = sync_digital_menu_themes(session, json_path)
    session.commit()

    assert count == 2
    original = session.scalar(
        select(DigitalMenuTheme).where(DigitalMenuTheme.id == "original")
    )
    assert original is not None
    assert original.is_active is True
    assert original.label == "Original"
    assert original.best_for == ["Any restaurant"]

    fixture[0]["label"] = "Original Updated"
    json_path.write_text(json.dumps(fixture), encoding="utf-8")
    sync_digital_menu_themes(session, json_path)
    session.commit()

    updated = session.scalar(
        select(DigitalMenuTheme).where(DigitalMenuTheme.id == "original")
    )
    assert updated is not None
    assert updated.label == "Original Updated"


@requires_db
def test_list_active_orders_by_sort_order(session):
    repo = DigitalMenuThemeRepository(session)
    repo.upsert(
        {
            "id": "b-theme",
            "label": "B",
            "description": "Second",
            "best_for": [],
            "recommendation": "",
            "style_keywords": [],
            "is_active": True,
            "sort_order": 2,
        }
    )
    repo.upsert(
        {
            "id": "a-theme",
            "label": "A",
            "description": "First",
            "best_for": [],
            "recommendation": "",
            "style_keywords": [],
            "is_active": True,
            "sort_order": 1,
        }
    )
    repo.upsert(
        {
            "id": "inactive-theme",
            "label": "Inactive",
            "description": "Hidden",
            "best_for": [],
            "recommendation": "",
            "style_keywords": [],
            "is_active": False,
            "sort_order": 0,
        }
    )
    session.commit()

    active = repo.list_active()
    assert [theme.id for theme in active] == ["a-theme", "b-theme"]
