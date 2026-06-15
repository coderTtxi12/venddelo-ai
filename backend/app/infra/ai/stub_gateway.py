from __future__ import annotations

from app.core.ai_gateway import (
    AIGatewayPort,
    ExtractedCategory,
    ExtractedProduct,
    ExtractionResult,
)
from app.core.palettes import AVAILABLE_PALETTES


class StubAIGateway(AIGatewayPort):
    """Deterministic AI provider for dev and tests."""

    def extract_menu(self, file_bytes: bytes, content_type: str) -> ExtractionResult:
        return ExtractionResult(
            detected_language="es",
            categories=[
                ExtractedCategory(
                    name="Platos",
                    products=[
                        ExtractedProduct(
                            name="Taco al pastor",
                            description="Taco con piña y cilantro",
                            price_cents=12000,
                        ),
                        ExtractedProduct(
                            name="Quesadilla",
                            description="Queso fundido en tortilla",
                            price_cents=8000,
                        ),
                    ],
                ),
                ExtractedCategory(
                    name="Bebidas",
                    products=[
                        ExtractedProduct(name="Agua natural", price_cents=3000),
                    ],
                ),
            ],
        )

    def optimize_image(self, image_bytes: bytes, content_type: str) -> bytes:
        return image_bytes

    def optimize_description(self, text: str, *, context: str = "") -> str:
        return f"{text} — optimizado para el comensal."

    def pick_palette(
        self,
        *,
        logo_bytes: bytes | None,
        brand_name: str,
        palettes: list[str],
    ) -> str:
        choices = palettes or AVAILABLE_PALETTES
        return choices[hash(brand_name) % len(choices)]

    def translate_texts(
        self,
        texts: dict[str, str],
        *,
        source_locale: str,
        target_locale: str,
    ) -> dict[str, str]:
        prefix = f"[{target_locale}] "
        return {k: prefix + v for k, v in texts.items()}
