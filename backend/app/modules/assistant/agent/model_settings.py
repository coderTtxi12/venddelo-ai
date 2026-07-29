"""Shared OpenAI Agents SDK model settings for assistant workflow agents."""

from __future__ import annotations

from agents import ModelSettings
from openai.types.shared import Reasoning

from app.core.config import Settings

_REASONING_ENCRYPTED_CONTENT = "reasoning.encrypted_content"


def build_assistant_model_settings(settings: Settings) -> ModelSettings:
    return ModelSettings(
        store=False,
        response_include=[_REASONING_ENCRYPTED_CONTENT],
        reasoning=Reasoning(
            effort=settings.openai_reasoning_effort,
            summary=settings.openai_reasoning_summary,
        ),
    )
