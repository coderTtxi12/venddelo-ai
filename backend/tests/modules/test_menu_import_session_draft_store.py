from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportDraft, OpenQuestion
from app.modules.assistant.skills.menu_import.session_draft_store import (
    get_ocr_original,
    get_working_batch,
    list_open_questions,
    persist_extraction_snapshots,
    set_working_batch,
    unanswered_question_ids,
)


def _session(**overrides):
    defaults = dict(
        status="extracting",
        draft_batches=[],
        ocr_original={},
        open_questions=[],
        clarification_answers={},
        source_files=[],
    )
    defaults.update(overrides)
    return MenuImportSession(**defaults)


def test_persist_extraction_snapshots_sets_literal_ocr_and_modeled_working_copy():
    session = _session()
    literal = ImportDraft(
        categories=[],
        open_questions=[OpenQuestion(id="q_ocr", question_es="¿OCR?")],
    )
    modeled = ImportDraft(
        categories=[],
        open_questions=[OpenQuestion(id="q1", question_es="¿Incluye bebida?")],
    )
    batch = ImportBatch(batch_index=0, categories=[], open_questions=modeled.open_questions)

    persist_extraction_snapshots(session, ocr_original=literal, working_batch=batch)

    assert get_ocr_original(session) is not None
    assert get_ocr_original(session).open_questions[0].id == "q_ocr"
    assert get_working_batch(session) is not None
    assert list_open_questions(session)[0].id == "q1"
    assert len(session.draft_batches) == 1


def test_unanswered_question_ids_respects_clarification_answers():
    session = _session(
        open_questions=[
            {"id": "q1", "question_es": "¿Uno?"},
            {"id": "q2", "question_es": "¿Dos?"},
        ],
        clarification_answers={"q1": "Sí"},
    )
    assert unanswered_question_ids(session) == ["q2"]


def test_set_working_batch_syncs_open_questions_column():
    session = _session()
    batch = ImportBatch(
        batch_index=0,
        categories=[],
        open_questions=[OpenQuestion(id="q_new", question_es="¿Nueva?")],
    )
    set_working_batch(session, batch)
    assert session.open_questions[0]["id"] == "q_new"
    assert session.draft_batches[0]["open_questions"][0]["id"] == "q_new"
