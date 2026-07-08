"""Structured user-facing response for the menu import agent."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class MenuImportQuizOption(BaseModel):
    id: str
    label: str

    @field_validator("id", "label", mode="before")
    @classmethod
    def _strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class MenuImportQuizQuestion(BaseModel):
    id: str
    question: str
    suggested_answers: list[MenuImportQuizOption] = Field(default_factory=list)
    allow_other: bool = True

    @field_validator("id", mode="before")
    @classmethod
    def _strip_id(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("question", mode="before")
    @classmethod
    def _normalize_question(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text and not text.endswith("?"):
            return f"{text}?"
        return text

    @field_validator("suggested_answers")
    @classmethod
    def _require_suggestions(
        cls,
        options: list[MenuImportQuizOption],
    ) -> list[MenuImportQuizOption]:
        if not options:
            raise ValueError("Each question needs at least one suggested answer")
        return options


class MenuImportUserResponse(BaseModel):
    """JSON envelope for every user-visible MenuImport turn."""

    message: str = Field(
        description=(
            "Prose for the owner: status, findings, next steps. "
            "Do not list clarification questions here."
        ),
    )
    questions: list[MenuImportQuizQuestion] = Field(default_factory=list)

    @field_validator("message", mode="before")
    @classmethod
    def _strip_message(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value
