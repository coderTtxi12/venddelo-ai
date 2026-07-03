from __future__ import annotations

import json

from app.core.vision.ports import (
    VisionAnalysisRequest,
    VisionAnalysisResult,
    VisionPort,
)


class StubVisionProvider(VisionPort):
    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        if "complement" in request.prompt.lower() or "suggest" in request.prompt.lower():
            data = {
                "suggested_groups": [
                    {
                        "title": "Salsas",
                        "required": False,
                        "selection": "multi",
                        "min_selections": 0,
                        "max_selections": 2,
                        "rationale": "Stub: typical taco/burger condiments",
                        "items": [
                            {"label": "Salsa verde", "price_delta_cents": 0},
                            {"label": "Salsa roja", "price_delta_cents": 0},
                        ],
                    }
                ],
                "notes": "Stub vision provider — set VISION_PROVIDER=openai for real analysis.",
            }
        else:
            data = {
                "dish_type": "burger",
                "visible_components": ["bun", "patty", "lettuce"],
                "visible_add_on_ideas": ["cheese", "bacon", "fries"],
                "beverage_pairing_ideas": ["cola", "water"],
                "confidence": "low",
                "notes": "Stub vision provider.",
            }
        return VisionAnalysisResult(
            data=data,
            model="stub",
            raw_text=json.dumps(data),
        )
