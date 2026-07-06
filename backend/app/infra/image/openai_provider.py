from __future__ import annotations

import base64

from app.core.config import Settings
from app.core.image.ports import (
    GeneratedImage,
    ImageGenerationError,
    ImageGenerationPort,
    ImageGenerationRequest,
)


def _is_gpt_image_model(model: str) -> bool:
    return model.startswith("gpt-image")


class OpenAIImageProvider(ImageGenerationPort):
    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required for the OpenAI image provider")

        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_image_model

    def _build_request(self, request: ImageGenerationRequest) -> dict[str, object]:
        """Build kwargs for ``images.generate``.

        GPT Image models (`gpt-image-2`, etc.) reject ``response_format`` — they always
        return base64 in ``data[].b64_json``. See OpenAI image generation guide.
        """
        kwargs: dict[str, object] = {
            "model": self._model,
            "prompt": request.prompt,
            "size": request.size,
            "n": 1,
        }
        extra_body: dict[str, object] = {}

        if _is_gpt_image_model(self._model):
            extra_body["quality"] = "medium"
            extra_body["output_format"] = "webp"
            extra_body["output_compression"] = 85
        else:
            kwargs["quality"] = "hd"
            kwargs["response_format"] = "b64_json"

        if extra_body:
            kwargs["extra_body"] = extra_body
        return kwargs

    def _decode_image_bytes(self, item: object) -> bytes:
        b64_json = getattr(item, "b64_json", None)
        if b64_json:
            return base64.b64decode(b64_json)

        url = getattr(item, "url", None)
        if url:
            import httpx

            try:
                response = httpx.get(str(url), timeout=60.0)
                response.raise_for_status()
            except Exception as exc:  # noqa: BLE001
                raise ImageGenerationError(f"Failed to download generated image: {exc}") from exc
            return response.content

        raise ImageGenerationError("OpenAI image API returned no b64_json or url payload")

    def generate(self, request: ImageGenerationRequest) -> GeneratedImage:
        try:
            response = self._client.images.generate(**self._build_request(request))
        except Exception as exc:  # noqa: BLE001 - mapped to domain error
            raise ImageGenerationError(str(exc)) from exc

        if not response.data:
            raise ImageGenerationError("OpenAI image API returned no data")

        item = response.data[0]
        image_bytes = self._decode_image_bytes(item)
        revised_prompt = getattr(item, "revised_prompt", None)
        content_type = "image/webp" if _is_gpt_image_model(self._model) else "image/png"
        response_format = getattr(response, "output_format", None)
        if response_format == "webp":
            content_type = "image/webp"
        elif response_format == "jpeg":
            content_type = "image/jpeg"
        elif response_format == "png":
            content_type = "image/png"
        return GeneratedImage(
            data=image_bytes,
            content_type=content_type,
            model=self._model,
            revised_prompt=revised_prompt,
        )
