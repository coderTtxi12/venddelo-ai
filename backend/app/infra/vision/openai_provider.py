from __future__ import annotations

import base64
import json
from typing import Any

from app.core.config import Settings
from app.core.vision.ports import (
    VisionAnalysisRequest,
    VisionAnalysisResult,
    VisionError,
    VisionPort,
)


class OpenAIVisionProvider(VisionPort):
    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required for the OpenAI vision provider")

        self._client = OpenAI(api_key=settings.openai_api_key)
        self._default_model = settings.openai_vision_model

    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        model = request.model or self._default_model
        content: list[dict[str, Any]] = [{"type": "text", "text": request.prompt}]
        if request.image_bytes:
            encoded = base64.b64encode(request.image_bytes).decode("ascii")
            media_type = request.image_media_type or "image/webp"
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{encoded}"},
                }
            )

        try:
            response = self._client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": content}],
                response_format={"type": "json_object"},
            )
        except Exception as exc:  # noqa: BLE001
            raise VisionError(str(exc)) from exc

        message = response.choices[0].message if response.choices else None
        raw_text = (message.content or "").strip() if message else ""
        if not raw_text:
            raise VisionError("OpenAI vision API returned empty content")

        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise VisionError("OpenAI vision API returned invalid JSON") from exc
        if not isinstance(data, dict):
            raise VisionError("OpenAI vision API JSON root must be an object")

        return VisionAnalysisResult(data=data, model=model, raw_text=raw_text)
