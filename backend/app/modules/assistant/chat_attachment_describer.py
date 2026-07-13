"""Brief vision/text summaries for chat attachments shown to agents and history."""

from __future__ import annotations

import asyncio
import logging

from app.core.config import Settings, get_settings
from app.core.storage import StorageError
from app.core.vision.ports import VisionAnalysisRequest, VisionError
from app.infra.storage.factory import build_storage
from app.infra.vision.factory import build_vision_provider
from app.modules.assistant.schemas import ChatAttachmentRef
from app.modules.assistant.skills.menu_import.document_loader import (
    DOCX_MIME,
    PDF_MIME,
    _load_docx_text_from_bytes,
    _load_pdf_pages_from_bytes,
)

logger = logging.getLogger(__name__)

_IMAGE_VISION_PROMPT = """\
Describe brevemente en español qué contiene este archivo adjunto de un restaurante.
Menciona si parece menú, foto de platillo, documento u otro, y 1-2 datos útiles (platillos, precios, secciones).
Máximo 2 oraciones cortas.

Responde solo JSON: {"description": "..."}\
"""

_DOCX_TEXT_PROMPT = """\
Resume en 1-2 oraciones en español qué contiene este documento Word de restaurante.
Archivo: {filename}

Contenido extraído:
{excerpt}

Responde solo JSON: {{"description": "..."}}\
"""


def _vision_description(
    *,
    image_bytes: bytes,
    media_type: str,
    settings: Settings,
) -> str | None:
    try:
        provider = build_vision_provider(settings)
        result = provider.analyze_json(
            VisionAnalysisRequest(
                prompt=_IMAGE_VISION_PROMPT,
                image_bytes=image_bytes,
                image_media_type=media_type,
                model=settings.openai_vision_model,
            )
        )
    except (VisionError, ValueError) as exc:
        logger.warning("Vision attachment description failed: %s", exc)
        return None

    description = result.data.get("description")
    if isinstance(description, str) and description.strip():
        return description.strip()
    return None


def _docx_description(*, data: bytes, filename: str, settings: Settings) -> str | None:
    try:
        text = _load_docx_text_from_bytes(data).strip()
    except Exception:
        logger.exception("DOCX text extraction failed filename=%s", filename)
        return None
    if not text:
        return None

    excerpt = text if len(text) <= 1200 else f"{text[:1197]}..."
    prompt = _DOCX_TEXT_PROMPT.format(filename=filename, excerpt=excerpt)
    try:
        from openai import OpenAI

        if not settings.openai_api_key:
            return excerpt[:240]
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=180,
        )
        choice = response.choices[0] if response.choices else None
        raw = getattr(choice.message, "content", None) if choice else None
        if not raw:
            return excerpt[:240]
        import json

        payload = json.loads(raw)
        description = payload.get("description")
        if isinstance(description, str) and description.strip():
            return description.strip()
    except Exception:
        logger.exception("DOCX attachment summary failed filename=%s", filename)
    return excerpt[:240]


def _describe_attachment_sync(
    attachment: ChatAttachmentRef,
    *,
    settings: Settings,
) -> str:
    filename = attachment.original_name.strip() or "archivo"
    mime = attachment.mime_type.strip().lower()
    fallback = f"Archivo {mime or 'adjunto'} sin descripción automática."

    try:
        data = build_storage(settings).read(attachment.storage_path)
    except StorageError:
        logger.warning(
            "Could not read attachment for description path=%s",
            attachment.storage_path,
        )
        return fallback

    description: str | None = None
    if mime.startswith("image/"):
        description = _vision_description(
            image_bytes=data,
            media_type=mime,
            settings=settings,
        )
    elif mime == PDF_MIME:
        pages = _load_pdf_pages_from_bytes(data)
        if pages:
            png, media = pages[0]
            description = _vision_description(
                image_bytes=png,
                media_type=media,
                settings=settings,
            )
    elif mime == DOCX_MIME:
        description = _docx_description(data=data, filename=filename, settings=settings)

    if description:
        return description
    return fallback


async def describe_chat_attachments(
    attachments: list[ChatAttachmentRef],
    *,
    settings: Settings | None = None,
) -> list[str]:
    if not attachments:
        return []
    resolved = settings or get_settings()
    tasks = [
        asyncio.to_thread(_describe_attachment_sync, attachment, settings=resolved)
        for attachment in attachments
    ]
    return list(await asyncio.gather(*tasks))
