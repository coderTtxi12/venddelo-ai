from __future__ import annotations

from app.core.ai_gateway import AIGatewayPort, ExtractionResult
from app.core.config import Settings
from app.infra.ai.stub_gateway import StubAIGateway


class OpenAIGateway(AIGatewayPort):
    """OpenAI-backed gateway; falls back to stub for extraction/image."""

    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_model
        self._stub = StubAIGateway()

    def extract_menu(self, file_bytes: bytes, content_type: str) -> ExtractionResult:
        return self._stub.extract_menu(file_bytes, content_type)

    def optimize_image(self, image_bytes: bytes, content_type: str) -> bytes:
        return self._stub.optimize_image(image_bytes, content_type)

    def optimize_description(self, text: str, *, context: str = "") -> str:
        prompt = (
            f"Rewrite this restaurant dish description to be more appealing "
            f"for customers. Keep facts accurate. Context: {context}. Text: {text}"
        )
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        content = response.choices[0].message.content
        return content.strip() if content else self._stub.optimize_description(text)

    def pick_palette(
        self,
        *,
        logo_bytes: bytes | None,
        brand_name: str,
        palettes: list[str],
    ) -> str:
        return self._stub.pick_palette(
            logo_bytes=logo_bytes, brand_name=brand_name, palettes=palettes
        )

    def translate_texts(
        self,
        texts: dict[str, str],
        *,
        source_locale: str,
        target_locale: str,
    ) -> dict[str, str]:
        if not texts:
            return {}
        lines = "\n".join(f"{k}={v}" for k, v in texts.items())
        prompt = (
            f"Translate each line from {source_locale} to {target_locale}. "
            f"Keep the same keys. Format: key=translation\n{lines}"
        )
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
        )
        content = response.choices[0].message.content or ""
        result: dict[str, str] = {}
        for line in content.splitlines():
            if "=" in line:
                key, val = line.split("=", 1)
                result[key.strip()] = val.strip()
        missing = set(texts) - set(result)
        if missing:
            return self._stub.translate_texts(
                texts, source_locale=source_locale, target_locale=target_locale
            )
        return result


def build_ai_gateway(settings: Settings | None = None) -> AIGatewayPort:
    from app.core.config import get_settings

    cfg = settings or get_settings()
    if cfg.openai_api_key:
        try:
            return OpenAIGateway(cfg)
        except Exception:
            return StubAIGateway()
    return StubAIGateway()
