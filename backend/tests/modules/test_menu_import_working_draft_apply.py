from unittest.mock import MagicMock, patch
import uuid

from sqlalchemy.orm import Session, sessionmaker

from app.db.models.assistant import AssistantConversation
from app.db.models.menu_import_session import MenuImportSession
from app.db.models.restaurant import Restaurant
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.menu_import.apply_batch import ApplyFullResult
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportBatch,
    ImportCategory,
    ImportDraft,
    ImportProduct,
)
from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion
from app.modules.assistant.skills.menu_import.session_draft_store import (
    get_working_batch,
    validate_working_batch,
)
from app.modules.assistant.skills.menu_import.tools import MenuImportSkill
from tests.conftest import requires_db


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


def _extracted_session_without_questions() -> MenuImportSession:
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
    ocr = ImportDraft(
        categories=batch.categories,
        open_questions=[],
    )
    return MenuImportSession(
        id=uuid.uuid4(),
        status="optimizing",
        ocr_original=ocr.model_dump(),
        draft_batches=[batch.model_dump()],
        open_questions=[],
        clarification_answers={},
        discovery_answers={},
        source_files=[{"path": "menu.pdf", "mime_type": "application/pdf"}],
        live_menu_snapshot=None,
        reconciliation_snapshot=None,
    )


def test_start_menu_extraction_batch_applies_when_no_open_questions():
    session = _extracted_session_without_questions()
    apply_result = ApplyFullResult(
        ok=True,
        summary="Applied",
        batches_applied=1,
        categories=1,
        products=1,
    )
    working = ImportBatch.model_validate(session.draft_batches[0])

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
            "app.modules.assistant.skills.menu_import.tools._apply_draft_to_live_menu",
            side_effect=_fake_apply,
        ) as apply_mock,
        patch(
            "app.modules.assistant.skills.menu_import.tools._public_menu_url",
            return_value="https://menu.example.com",
        ),
    ):
        result = skill.execute("start_menu_extraction_batch", {}, ctx)

    assert result.ok is True
    assert "applied" in result.summary.lower()
    assert result.data["products"] == 1
    assert result.data["status"] == "enriching"
    apply_mock.assert_called_once()


def test_model_working_draft_applies_existing_draft_without_inputs_when_no_questions():
    session = _extracted_session_without_questions()
    working = ImportBatch.model_validate(session.draft_batches[0])
    apply_result = ApplyFullResult(
        ok=True,
        summary="Applied",
        batches_applied=1,
        categories=1,
        products=1,
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
            "app.modules.assistant.skills.menu_import.tools.capture_live_menu_import_draft",
            return_value={"captured_at": "now", "import_draft": {}},
        ),
        patch(
            "app.modules.assistant.skills.menu_import.tools._apply_draft_to_live_menu",
            side_effect=_fake_apply,
        ) as apply_mock,
        patch(
            "app.modules.assistant.skills.menu_import.tools.model_import_draft",
        ) as model_mock,
        patch("app.modules.assistant.skills.menu_import.tools._repo") as repo_mock,
        patch(
            "app.modules.assistant.skills.menu_import.tools._public_menu_url",
            return_value="https://menu.example.com",
        ),
    ):
        result = skill.execute("model_working_draft", {}, ctx)

    assert result.ok is True
    assert result.data["applied_to_live"] is True
    assert result.data["open_questions_remaining"] == 0
    model_mock.assert_not_called()
    apply_mock.assert_called_once()
    repo_mock.return_value.update.assert_not_called()


def test_model_working_draft_updates_draft_batches_in_session_before_apply():
    session = _modeling_session()
    modeled = _sample_modeled_draft()
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
            side_effect=ValueError("product_ids contains products not linked to category"),
        ),
        patch("app.modules.assistant.skills.menu_import.tools._repo") as repo_mock,
    ):
        result = skill.execute(
            "model_working_draft",
            {"clarification_answers": {"q_1": "Sí"}},
            ctx,
        )

    assert result.ok is False
    assert "apply failed" in result.summary.lower()
    working = get_working_batch(session)
    assert working is not None
    assert working.categories[0].products[0].name == "Pastor Modelado"
    assert working.open_questions == []
    assert session.open_questions == []
    # Once before apply (persist modeled draft), once on apply failure status update.
    assert repo_mock.return_value.update.call_count == 2
    ctx.uow.commit.assert_called()


@requires_db
def test_model_working_draft_persists_modeled_draft_to_db_when_apply_fails(session: Session):
    restaurant = Restaurant(name="Draft Persist Test", subdomain=f"draft-{uuid.uuid4().hex[:8]}")
    session.add(restaurant)
    session.flush()
    conversation = AssistantConversation(restaurant_id=restaurant.id)
    session.add(conversation)
    session.flush()

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
        ],
    )
    old_batch = ImportBatch(
        batch_index=0,
        categories=ocr.categories,
        promotions=[],
        open_questions=ocr.open_questions,
    )
    import_session = MenuImportSession(
        restaurant_id=restaurant.id,
        conversation_id=conversation.id,
        status="clarifying",
        ocr_original=ocr.model_dump(),
        draft_batches=[old_batch.model_dump()],
        open_questions=[question.model_dump() for question in ocr.open_questions],
        clarification_answers={"q_1": "Sí"},
        discovery_answers={},
        source_files=[],
    )
    session.add(import_session)
    session.commit()
    import_session_id = import_session.id

    modeled = _sample_modeled_draft()
    session_factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False)

    def _run_tool() -> None:
        with SqlAlchemyUnitOfWork(session_factory=session_factory) as uow:
            ctx = AgentContext(
                restaurant_id=restaurant.id,
                conversation_id=conversation.id,
                uow=uow,
                effective_skill_ids=["menu_import"],
            )
            skill = MenuImportSkill()
            with (
                patch(
                    "app.modules.assistant.skills.menu_import.tools._get_active_session",
                    return_value=uow.session.get(MenuImportSession, import_session_id),
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
                    side_effect=ValueError("product_ids contains products not linked to category"),
                ),
            ):
                result = skill.execute(
                    "model_working_draft",
                    {"clarification_answers": {"q_1": "Sí"}},
                    ctx,
                )
            assert result.ok is False
            uow.commit()

    _run_tool()

    reloaded = session.get(MenuImportSession, import_session_id)
    assert reloaded is not None
    working = get_working_batch(reloaded)
    assert working is not None
    assert working.categories[0].products[0].name == "Pastor Modelado"
    assert working.open_questions == []
    assert reloaded.open_questions == []
    assert reloaded.status == "optimizing"
