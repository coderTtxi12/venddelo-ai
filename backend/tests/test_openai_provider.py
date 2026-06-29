from app.infra.llm.openai_provider import model_supports_custom_temperature


def test_gpt5_nano_rejects_custom_temperature():
    assert model_supports_custom_temperature("gpt-5-nano-2025-08-07") is False


def test_gpt4o_mini_accepts_custom_temperature():
    assert model_supports_custom_temperature("gpt-4o-mini") is True


def test_o_series_rejects_custom_temperature():
    assert model_supports_custom_temperature("o1-mini") is False
    assert model_supports_custom_temperature("o3-mini") is False
