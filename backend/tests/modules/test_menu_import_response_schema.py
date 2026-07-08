from app.modules.assistant.skills.menu_import.response_schema import (
    MenuImportQuizOption,
    MenuImportQuizQuestion,
    MenuImportUserResponse,
)


def test_menu_import_user_response_normalizes_question_mark():
    response = MenuImportUserResponse(
        message="Estado del import.",
        questions=[
            MenuImportQuizQuestion(
                id="q_price",
                question="El combo incluye bebida",
                suggested_answers=[
                    MenuImportQuizOption(id="opt_1", label="Sí"),
                    MenuImportQuizOption(id="opt_2", label="No"),
                ],
            ),
        ],
    )
    assert response.questions[0].question.endswith("?")


def test_menu_import_user_response_allows_empty_questions():
    response = MenuImportUserResponse(message="Listo para aplicar.", questions=[])
    assert response.questions == []
