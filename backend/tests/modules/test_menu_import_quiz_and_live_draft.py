from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion
from app.modules.assistant.skills.menu_import.live_menu_to_draft import build_import_draft_from_live_menu
from app.modules.assistant.skills.menu_import.quiz_bridge import open_questions_to_quiz
from app.modules.menu.schemas import (
    CategoryDTO,
    FullMenuDTO,
    OptionGroupDTO,
    OptionItemDTO,
    ProductDTO,
)


def test_open_questions_to_quiz_maps_suggestions_and_strips_otro():
    questions = open_questions_to_quiz(
        [
            OpenQuestion(
                id="q_combo",
                question_es="¿El combo incluye bebida?",
                suggested_answers=["Sí", "No", "Otro"],
            )
        ]
    )
    assert len(questions) == 1
    assert questions[0].id == "q_combo"
    assert questions[0].question.endswith("?")
    assert [option.label for option in questions[0].suggested_answers] == ["Sí", "No"]
    assert questions[0].allow_other is True


def test_format_menu_import_assistant_turn_for_history_puts_summary_before_quiz():
    from app.modules.assistant.skills.menu_import.quiz_bridge import (
        MENU_IMPORT_QUIZ_HISTORY_HEADER,
        format_menu_import_assistant_turn_for_history,
    )
    from app.modules.assistant.skills.menu_import.response_schema import (
        MenuImportQuizOption,
        MenuImportQuizQuestion,
    )

    summary = (
        "Resumen de importación: OCR completado; 3 preguntas de aclaración pendientes. "
        "Por favor, responda el cuestionario debajo para avanzar."
    )
    questions = [
        MenuImportQuizQuestion(
            id="q_sabor",
            question="¿Qué significa Sabor extra: $20?",
            suggested_answers=[
                MenuImportQuizOption(id="opt_1", label="Por orden"),
                MenuImportQuizOption(id="opt_2", label="Por porción"),
            ],
        )
    ]

    rendered = format_menu_import_assistant_turn_for_history(summary, questions)

    assert rendered.startswith(summary)
    assert rendered.index(summary) < rendered.index(MENU_IMPORT_QUIZ_HISTORY_HEADER)
    assert "[q_sabor]" in rendered
    assert "Sabor extra" in rendered
    assert "Opciones: Por orden, Por porción" in rendered


def test_build_import_draft_from_live_menu_matches_public_visibility():
    restaurant_id = uuid.uuid4()
    category_id = uuid.uuid4()
    product_active_id = uuid.uuid4()
    product_inactive_id = uuid.uuid4()
    draft_product_id = uuid.uuid4()

    category = CategoryDTO(
        id=category_id,
        restaurant_id=restaurant_id,
        name="Tacos",
        description="Clásicos",
        image_path=None,
        sort_index=0,
        display_layout=None,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    def _product(
        *,
        product_id: uuid.UUID,
        name: str,
        status: str,
        sort_index: int,
    ) -> ProductDTO:
        return ProductDTO(
            id=product_id,
            restaurant_id=restaurant_id,
            name=name,
            description=None,
            price_cents=3500,
            currency="MXN",
            image_path=None,
            status=status,  # type: ignore[arg-type]
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            category_ids=[category_id],
            category_sort_indices={str(category_id): sort_index},
            option_groups=[
                OptionGroupDTO(
                    id=uuid.uuid4(),
                    product_id=product_id,
                    title="Salsa",
                    required=True,
                    selection="single",
                    min_selections=1,
                    max_selections=1,
                    sort_index=0,
                    is_active=True,
                    items=[
                        OptionItemDTO(
                            id=uuid.uuid4(),
                            label="Verde",
                            price_delta_cents=0,
                            sort_index=0,
                            is_active=True,
                        ),
                        OptionItemDTO(
                            id=uuid.uuid4(),
                            label="Agotada",
                            price_delta_cents=0,
                            sort_index=1,
                            is_active=False,
                        ),
                    ],
                )
            ],
        )

    menu = FullMenuDTO(
        restaurant_id=restaurant_id,
        categories=[category],
        products=[
            _product(product_id=product_active_id, name="Pastor", status="active", sort_index=0),
            _product(
                product_id=product_inactive_id,
                name="Suadero",
                status="inactive",
                sort_index=1,
            ),
            _product(product_id=draft_product_id, name="Borrador", status="draft", sort_index=2),
        ],
    )

    draft = build_import_draft_from_live_menu(menu, promotions=[])

    assert len(draft.categories) == 1
    assert draft.categories[0].name == "Tacos"
    product_names = [product.name for product in draft.categories[0].products]
    assert product_names == ["Pastor", "Suadero"]
    pastor = draft.categories[0].products[0]
    assert pastor.is_available is True
    assert pastor.price_mxn == 35
    suadero = draft.categories[0].products[1]
    assert suadero.is_available is False
    option_labels = [item.label for item in pastor.option_groups[0].items]
    assert option_labels == ["Verde", "Agotada"]
    assert draft.open_questions == []
