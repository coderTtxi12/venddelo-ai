"""Shared OpenAI Agents SDK model settings for assistant workflow agents."""

from __future__ import annotations

from agents import ModelSettings
from openai.types.shared import Reasoning

from app.core.config import Settings


def build_assistant_model_settings(settings: Settings) -> ModelSettings:
    return ModelSettings(
        reasoning=Reasoning(
            effort=settings.openai_reasoning_effort,
            summary=settings.openai_reasoning_summary,
        ),
    )
