from app.modules.assistant.skills.menu_import.draft_schema import ImportBatch, ImportCategory, ImportProduct
from app.modules.assistant.skills.menu_import.session_draft_store import validate_working_batch
from app.db.models.menu_import_session import MenuImportSession


def test_validate_working_batch_reads_editable_copy():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Tacos",
                products=[ImportProduct(ref="prod_1", name="Pastor", price_mxn=120)],
            )
        ],
        promotions=[],
        open_questions=[],
    )
    session = MenuImportSession(
        status="preview_batch",
        draft_batches=[batch.model_dump()],
        ocr_original={},
        open_questions=[],
        clarification_answers={},
        source_files=[],
    )

    validated = validate_working_batch(session)

    assert validated.categories[0].products[0].name == "Pastor"
    assert validated.categories[0].products[0].price_mxn == 120


def test_validate_working_batch_rejects_empty_categories():
    batch = ImportBatch(
        batch_index=0,
        categories=[
            ImportCategory(ref="cat_1", name="Alitas", products=[]),
            ImportCategory(
                ref="cat_2",
                name="Tacos",
                products=[ImportProduct(ref="prod_1", name="Pastor", price_mxn=120)],
            ),
        ],
        promotions=[],
        open_questions=[],
    )
    session = MenuImportSession(
        status="preview_batch",
        draft_batches=[batch.model_dump()],
        ocr_original={},
        open_questions=[],
        clarification_answers={},
        source_files=[],
    )

    try:
        validate_working_batch(session)
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Alitas" in str(exc)
        assert "sin productos enlazados" in str(exc)
