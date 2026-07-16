from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.session_context import (
    build_full_import_session_context,
    build_import_clarification_context,
    build_import_session_context,
    build_router_import_session_context,
    import_session_needs_router_attention,
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


def test_import_session_needs_router_attention_false_after_apply_without_questions():
    session = _session(
        status="enriching",
        draft_batches=[
            {
                "batch_index": 0,
                "categories": [
                    {
                        "ref": "cat_1",
                        "name": "Tacos",
                        "products": [
                            {"ref": "prod_1", "name": "Pastor", "price_mxn": 120},
                        ],
                    }
                ],
                "applied_at": "2026-07-15T21:00:00+00:00",
            }
        ],
        open_questions=[],
        clarification_answers={},
    )

    assert import_session_needs_router_attention(session) is False
    assert build_router_import_session_context(session) is None


def test_import_session_needs_router_attention_true_while_clarifying():
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

    assert import_session_needs_router_attention(session) is True
    assert build_router_import_session_context(session) is not None


def test_router_hides_import_context_after_apply_even_without_applied_at_flag():
    """ENRICHING means apply finished; router must not see import blocks."""
    session = _session(
        status="enriching",
        ocr_original={"categories": [], "promotions": [], "open_questions": []},
        draft_batches=[
            {
                "batch_index": 0,
                "categories": [
                    {
                        "ref": "cat_1",
                        "name": "Tacos",
                        "products": [
                            {"ref": "prod_1", "name": "Pastor", "price_mxn": 120},
                        ],
                    }
                ],
            }
        ],
        open_questions=[],
        clarification_answers={},
        live_menu_snapshot={"captured_at": "now", "import_draft": {"categories": []}},
    )
    user_message = "cuantos productos tengo que no tienenn imagen?"

    assert import_session_needs_router_attention(session) is False
    assert build_router_import_session_context(session, user_message=user_message) is None


def test_router_still_shows_clarification_for_pending_questions_with_free_text():
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
    user_message = "consolida los tamaños de alitas en un solo producto"

    payload = build_router_import_session_context(session, user_message=user_message)

    assert payload is not None
    assert "Preguntas pendientes" in payload
    assert "consolida los tamaños" in payload
    assert "model_working_draft" in payload
