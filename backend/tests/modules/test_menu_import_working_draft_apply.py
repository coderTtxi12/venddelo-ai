from unittest.mock import MagicMock, patch
import uuid

from app.db.models.menu_import_session import MenuImportSession
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.apply_batch import ApplyFullResult
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportCategory,
    ImportDraft,
    ImportProduct,
)
from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion
from app.modules.assistant.skills.menu_import.session_draft_store import validate_working_batch
from app.modules.assistant.skills.menu_import.tools import MenuImportSkill


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


def _sample_modeled_draft() -> ImportDraft:
    return ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Tacos",
                products=[
                    ImportProduct(ref="prod_1", name="Pastor Modelado", price_mxn=125),
                    ImportProduct(ref="prod_2", name="Asada", price_mxn=130),
                ],
            )
        ],
        open_questions=[],
    )


def _modeling_session(*, with_open_question: bool = False) -> MenuImportSession:
    ocr = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat_1",
                name="Tacos",
                products=[ImportProduct(ref="prod_1", name="Pastor", price_mxn=120)],
            )
        ],
        open_questions=[
            OpenQuestion(id="q_1", question_es="¿Incluye bebida?", suggested_answers=["Sí", "No"])
        ]
        if with_open_question
        else [],
    )
    return MenuImportSession(
        id=uuid.uuid4(),
        status="clarifying",
        ocr_original=ocr.model_dump(),
        draft_batches=[],
        open_questions=ocr.open_questions,
        clarification_answers={"q_1": "Sí"},
        discovery_answers={},
        source_files=[],
        live_menu_snapshot=None,
        reconciliation_snapshot=None,
    )


def test_model_working_draft_applies_modeled_draft_to_live_when_complete():
    session = _modeling_session()
    modeled = _sample_modeled_draft()
    working = ImportBatch(batch_index=0, categories=modeled.categories, promotions=[], open_questions=[])
    apply_result = ApplyFullResult(
        ok=True,
        summary="Applied",
        batches_applied=1,
        categories=1,
        products=2,
    )

    def _fake_apply(_ctx, import_session):
        import_session.status = "enriching"
        return apply_result, working, None

    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=MagicMock(),
        effective_skill_ids=["menu_import"],
    )
    skill = MenuImportSkill()

    with (
        patch(
            "app.modules.assistant.skills.menu_import.tools._get_active_session",
            return_value=session,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.model_import_draft",
            return_value=modeled,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.enrich_import_draft",
            side_effect=lambda draft: draft,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.capture_live_menu_import_draft",
            return_value={"captured_at": "now", "import_draft": {}},
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools._apply_draft_to_live_menu",
            side_effect=_fake_apply,
        ) as apply_mock,
        patch("app.modules.assistant.skills.menu_import.tools._repo") as repo_mock,
        patch(
            "app.modules.assistant.skills.menu_import.tools._public_menu_url",
            return_value="https://menu.example.com",
        ),
    ):
        result = skill.execute(
            "model_working_draft",
            {"clarification_answers": {"q_1": "Sí"}},
            ctx,
        )

    assert result.ok is True
    assert "applied" in result.summary.lower()
    assert result.data["applied_to_live"] is True
    assert result.data["products"] == 2
    assert result.data["status"] == "enriching"
    apply_mock.assert_called_once()


def test_model_working_draft_skips_apply_while_questions_remain():
    session = _modeling_session(with_open_question=True)
    modeled = _sample_modeled_draft()
    modeled.open_questions = [
        OpenQuestion(id="q_2", question_es="¿Por pieza?", suggested_answers=["Sí", "No"])
    ]
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=MagicMock(),
        effective_skill_ids=["menu_import"],
    )
    skill = MenuImportSkill()

    with (
        patch(
            "app.modules.assistant.skills.menu_import.tools._get_active_session",
            return_value=session,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.model_import_draft",
            return_value=modeled,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools.enrich_import_draft",
            side_effect=lambda draft: draft,
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools._apply_draft_to_live_menu",
        ) as apply_mock,
        patch("app.modules.assistant.skills.menu_import.tools._repo") as repo_mock,
    ):
        result = skill.execute(
            "model_working_draft",
            {"clarification_answers": {"q_1": "Sí"}},
            ctx,
        )

    assert result.ok is True
    assert result.data["open_questions_remaining"] == 1
    assert "applied_to_live" not in result.data
    assert session.status == "clarifying"
    apply_mock.assert_not_called()
    repo_mock.return_value.update.assert_called_once()
