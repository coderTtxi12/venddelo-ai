from app.core.config import Settings
from app.modules.assistant.agent.model_settings import build_assistant_model_settings


def test_build_assistant_model_settings_uses_configured_reasoning():
    settings = Settings(
        openai_reasoning_effort="medium",
        openai_reasoning_summary="auto",
    )
    model_settings = build_assistant_model_settings(settings)
    assert model_settings.reasoning is not None
    assert model_settings.reasoning.effort == "medium"
    assert model_settings.reasoning.summary == "auto"
