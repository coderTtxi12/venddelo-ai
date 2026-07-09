from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.session_context import (
    build_import_session_context,
)


def _session(**overrides):
    defaults = dict(
        status="extracting",
        draft_batches=[],
        discovery_answers={},
        source_files=[],
    )
    defaults.update(overrides)
    return MenuImportSession(**defaults)


def test_returns_none_when_no_session():
    assert build_import_session_context(None) is None


def test_returns_none_for_terminal_session():
    assert build_import_session_context(_session(status="completed")) is None
    assert build_import_session_context(_session(status="cancelled")) is None


def test_summarizes_active_session_with_menu_context():
    batch = {
        "batch_index": 0,
        "categories": [
            {
                "ref": "cat_1",
                "name": "Hamburguesas",
                "products": [
                    {"ref": "prod_1", "name": "La Javis", "price_mxn": 120},
                    {"ref": "prod_2", "name": "La Clásica", "price_mxn": 100},
                ],
            }
        ],
    }
    session = _session(
        draft_batches=[batch],
        discovery_answers={"menu_context": "Alitas y boneless van en una sola categoría"},
        source_files=[{"path": "a.pdf", "mime_type": "application/pdf"}],
    )

    summary = build_import_session_context(session)

    assert summary is not None
    assert "ACTIVA" in summary
    assert "extracting" in summary
    assert "Productos en borrador editable (OCR copia): 2" in summary
    assert "Archivos fuente registrados: 1" in summary
    assert "Contexto del dueño (pre-OCR)" in summary
    assert "Alitas y boneless" in summary
