from app.core.config import Settings
from app.infra.vision.factory import build_vision_provider
from app.infra.vision.openai_provider import OpenAIVisionProvider
from app.infra.vision.stub_provider import StubVisionProvider


def test_build_vision_provider_defaults_to_stub():
    settings = Settings(vision_provider="stub")
    provider = build_vision_provider(settings)
    assert isinstance(provider, StubVisionProvider)


def test_build_vision_provider_openai_without_key_falls_back_to_stub():
    settings = Settings(vision_provider="openai", openai_api_key=None)
    provider = build_vision_provider(settings)
    assert isinstance(provider, StubVisionProvider)


def test_build_vision_provider_openai_with_key():
    settings = Settings(vision_provider="openai", openai_api_key="sk-test")
    provider = build_vision_provider(settings)
    assert isinstance(provider, OpenAIVisionProvider)


def test_stub_vision_returns_image_analysis_shape():
    from app.core.vision.ports import VisionAnalysisRequest

    result = StubVisionProvider().analyze_json(
        VisionAnalysisRequest(prompt="Analyze this menu product photo")
    )
    assert "visible_components" in result.data


def test_stub_vision_returns_complement_suggestion_shape():
    from app.core.vision.ports import VisionAnalysisRequest

    result = StubVisionProvider().analyze_json(
        VisionAnalysisRequest(prompt="Suggest complement groups for this product")
    )
    assert isinstance(result.data.get("suggested_groups"), list)
