from __future__ import annotations

import base64

from app.core.image.ports import (
    GeneratedImage,
    ImageGenerationPort,
    ImageGenerationRequest,
)

# Minimal 1x1 WebP for tests and local dev without OpenAI image API.
_STUB_WEBP = base64.b64decode(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v09AAA="
)


class StubImageProvider(ImageGenerationPort):
    def generate(self, request: ImageGenerationRequest) -> GeneratedImage:
        return GeneratedImage(
            data=_STUB_WEBP,
            content_type="image/webp",
            model="stub",
            revised_prompt=request.prompt[:200],
        )
