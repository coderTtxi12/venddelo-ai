from app.modules.assistant.skills.menu_import.complement_questions import (
    build_complement_questions,
    merge_open_questions,
)
from app.modules.assistant.skills.menu_import.draft_schema import (
    ImportCategory,
    ImportDraft,
    ImportOptionGroup,
    ImportProduct,
    OpenQuestion,
)
from app.modules.assistant.skills.menu_import.menu_reconcile import ReconciliationPlan


def test_build_complement_questions_live_conflict():
    draft = ImportDraft(
        categories=[
            ImportCategory(
                ref="cat1",
                name="Burgers",
                products=[
                    ImportProduct(
                        ref="p1",
                        name="Classic Burger",
                        price_mxn=120,
                        option_groups=[
                            ImportOptionGroup(ref="g1", title="Extras", required=False, items=[])
                        ],
                    )
                ],
            )
        ]
    )
    plan = ReconciliationPlan(products_with_existing_groups=frozenset({"p1"}))
    questions = build_complement_questions(draft, plan)
    assert len(questions) == 1
    assert questions[0].id == "complement_live_conflict_p1"
    assert "Classic Burger" in questions[0].question_es


def test_merge_open_questions_dedupes():
    draft = ImportDraft(
        open_questions=[
            OpenQuestion(id="q1", question_es="¿Tamaño obligatorio?"),
        ]
    )
    extra = [
        OpenQuestion(id="q1", question_es="duplicate"),
        OpenQuestion(id="q2", question_es="¿Salsa?"),
    ]
    merged = merge_open_questions(draft, extra)
    assert [q.id for q in merged.open_questions] == ["q1", "q2"]
