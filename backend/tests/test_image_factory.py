from app.core.config import Settings
from app.core.image.ports import ImageGenerationRequest
from app.infra.image.factory import build_image_provider
from app.infra.image.openai_provider import OpenAIImageProvider
from app.infra.image.stub_provider import StubImageProvider


def test_build_image_provider_defaults_to_stub():
    settings = Settings(image_provider="stub")
    provider = build_image_provider(settings)
    assert isinstance(provider, StubImageProvider)


def test_build_image_provider_openai_without_key_falls_back_to_stub():
    settings = Settings(image_provider="openai", openai_api_key=None)
    provider = build_image_provider(settings)
    assert isinstance(provider, StubImageProvider)


def test_build_image_provider_openai_with_key():
    settings = Settings(image_provider="openai", openai_api_key="sk-test")
    provider = build_image_provider(settings)
    assert isinstance(provider, OpenAIImageProvider)


def test_gpt_image_request_omits_response_format():
    provider = OpenAIImageProvider(
        Settings(openai_api_key="sk-test", openai_image_model="gpt-image-2")
    )
    kwargs = provider._build_request(ImageGenerationRequest(prompt="Taco al pastor"))
    assert "response_format" not in kwargs
    assert kwargs["extra_body"] == {
        "quality": "high",
        "output_format": "webp",
        "output_compression": 85,
    }


def test_dalle_request_uses_response_format_b64_json():
    provider = OpenAIImageProvider(
        Settings(openai_api_key="sk-test", openai_image_model="dall-e-3")
    )
    kwargs = provider._build_request(ImageGenerationRequest(prompt="Taco al pastor"))
    assert kwargs["response_format"] == "b64_json"
    assert "extra_body" not in kwargs
