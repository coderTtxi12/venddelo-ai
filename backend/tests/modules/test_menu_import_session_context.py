from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.session_context import (
    build_import_session_context,
)


def _session(**overrides):
    defaults = dict(
        status="clarifying",
        draft_batches=[],
        clarification_answers={},
        source_files=[],
    )
    defaults.update(overrides)
    return MenuImportSession(**defaults)


def test_returns_none_when_no_session():
    assert build_import_session_context(None) is None


def test_returns_none_for_terminal_session():
    assert build_import_session_context(_session(status="completed")) is None
    assert build_import_session_context(_session(status="cancelled")) is None


def test_summarizes_active_session_with_pending_questions():
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
        "open_questions": [
            {"id": "q_papas", "question_es": "¿Qué extras para papas?"},
            {"id": "q_carne", "question_es": "¿Extras de carne?"},
        ],
    }
    session = _session(
        draft_batches=[batch],
        source_files=[{"path": "a.pdf", "mime_type": "application/pdf"}],
    )

    summary = build_import_session_context(session)

    assert summary is not None
    assert "ACTIVA" in summary
    assert "clarifying" in summary
    assert "Productos extraídos por OCR: 2" in summary
    assert "Archivos fuente registrados: 1" in summary
    assert "Preguntas de aclaración pendientes: 2" in summary
    assert "[q_papas] ¿Qué extras para papas?" in summary
    assert "[q_carne] ¿Extras de carne?" in summary


def test_excludes_already_answered_questions():
    batch = {
        "batch_index": 0,
        "categories": [],
        "open_questions": [
            {"id": "q1", "question_es": "Pregunta 1"},
            {"id": "q2", "question_es": "Pregunta 2"},
        ],
    }
    session = _session(
        draft_batches=[batch],
        clarification_answers={"q1": "ya respondida"},
    )

    summary = build_import_session_context(session)

    assert summary is not None
    assert "Preguntas de aclaración pendientes: 1" in summary
    assert "[q2] Pregunta 2" in summary
    assert "q1" not in summary
