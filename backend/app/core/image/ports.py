from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, Field


class ImageGenerationError(Exception):
    """Uniform error type wrapping provider-specific image generation failures."""


class GeneratedImage(BaseModel):
    data: bytes
    content_type: str = "image/png"
    model: str
    revised_prompt: str | None = None


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(min_length=1)
    size: str = "1024x1024"


class ImageGenerationPort(ABC):
    @abstractmethod
    def generate(self, request: ImageGenerationRequest) -> GeneratedImage: ...
