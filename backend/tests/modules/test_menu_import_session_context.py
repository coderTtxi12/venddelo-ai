from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.session_context import (
    build_full_import_session_context,
    build_import_clarification_context,
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


def test_build_import_clarification_context_lists_pending_questions_and_owner_instructions():
    session = _session(
        status="clarifying",
        ocr_original={"categories": [], "promotions": [], "open_questions": []},
        open_questions=[
            {
                "id": "q_sabor",
                "question_es": "¿Qué significa Sabor extra: $20?",
                "suggested_answers": ["Por orden", "Por porción"],
            },
            {
                "id": "q_ranch",
                "question_es": "¿Aderezo ranch extra es por porción?",
                "suggested_answers": ["Sí", "No"],
            },
        ],
        clarification_answers={},
    )

    context = build_import_clarification_context(
        session,
        user_message=(
            "para el producto Bolas de helado, agregale Chocolate, Fresa, Vainilla "
            "como opción obligatoria de una sola elección"
        ),
    )

    assert context is not None
    assert "Aclaraciones de importación de menú" in context
    assert "Preguntas pendientes" in context
    assert "[q_sabor]" in context
    assert "Sabor extra" in context
    assert "Instrucciones adicionales en el mensaje actual" in context
    assert "Bolas de helado" in context
    assert "menu_import" in context
    assert "model_working_draft" in context


def test_build_full_import_session_context_combines_session_clarification_and_owner_hint():
    session = _session(
        status="clarifying",
        ocr_original={"categories": [], "promotions": [], "open_questions": []},
        open_questions=[
            {
                "id": "q_1",
                "question_es": "¿Incluye bebida?",
                "suggested_answers": ["Sí", "No"],
            }
        ],
    )
    user_message = "agrega opciones a Bolas de helado: Chocolate, Fresa, Vainilla"

    payload = build_full_import_session_context(session, user_message=user_message)

    assert payload is not None
    assert "sesión de importación de menú ACTIVA" in payload
    assert "Preguntas pendientes" in payload
    assert "Owner turn (call model_working_draft)" in payload
    assert "Bolas de helado" in payload
