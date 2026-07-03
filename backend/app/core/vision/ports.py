from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class VisionError(Exception):
    """Uniform error type wrapping provider-specific vision failures."""


class VisionAnalysisRequest(BaseModel):
    prompt: str = Field(min_length=1)
    image_bytes: bytes | None = None
    image_media_type: str = "image/webp"
    model: str | None = None


class VisionAnalysisResult(BaseModel):
    data: dict[str, Any]
    model: str
    raw_text: str | None = None


class VisionPort(ABC):
    @abstractmethod
    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult: ...
