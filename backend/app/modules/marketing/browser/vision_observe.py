"""Screenshot + vision analysis for the Facebook browser agent."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.core.vision.ports import VisionAnalysisRequest, VisionError, VisionPort
from app.infra.vision.factory import build_vision_provider

logger = logging.getLogger(__name__)

FACEBOOK_VISION_PROMPT = """
You are helping a browser agent post on Facebook web.
Look at the screenshot and return JSON only with this shape:
{
  "page_summary": "short description of what is on screen",
  "logged_in": true/false,
  "login_form_visible": true/false,
  "composer_visible": true/false,
  "composer_open": true/false,
  "blockers": ["cookie banner", "captcha", "..."],
  "targets": [
    {
      "purpose": "open_composer|type_post|publish|dismiss_dialog|login|other",
      "label": "visible text or aria name",
      "role": "button|textbox|link|...",
      "selector_hint": "best CSS/Playwright selector guess or empty",
      "x": 0,
      "y": 0
    }
  ],
  "next_action_hint": "one sentence what to do next to publish a feed post"
}

Coordinates x,y are pixel positions from the top-left of the screenshot (integers).
Prefer Spanish and English Facebook UI (¿Qué estás pensando?, What's on your mind?, Publicar, Post).
If the login form is visible, say so clearly.
""".strip()


async def capture_screenshot_png(page: Any) -> bytes:
    return await page.screenshot(type="png", full_page=False)


def _analyze_screenshot_sync(
    image_bytes: bytes,
    *,
    settings: Settings,
    vision: VisionPort | None = None,
) -> dict[str, Any]:
    provider = vision or build_vision_provider(settings)
    result = provider.analyze_json(
        VisionAnalysisRequest(
            prompt=FACEBOOK_VISION_PROMPT,
            image_bytes=image_bytes,
            image_media_type="image/png",
            model=settings.openai_vision_model,
        )
    )
    return {
        "model": result.model,
        "analysis": result.data,
    }


async def observe_with_vision(
    page: Any,
    *,
    settings: Settings | None = None,
    vision: VisionPort | None = None,
) -> dict[str, Any]:
    """Screenshot the viewport and describe it with the vision model."""
    settings = settings or get_settings()
    image_bytes = await capture_screenshot_png(page)
    try:
        vision_payload = await asyncio.to_thread(
            _analyze_screenshot_sync,
            image_bytes,
            settings=settings,
            vision=vision,
        )
    except (VisionError, ValueError) as exc:
        logger.warning("facebook vision observe failed: %s", exc)
        return {
            "model": None,
            "analysis": None,
            "error": str(exc),
        }
    return vision_payload


def format_vision_for_agent(payload: dict[str, Any]) -> str:
    if payload.get("error"):
        return f"Vision error: {payload['error']}"
    analysis = payload.get("analysis") or {}
    return json.dumps(
        {
            "model": payload.get("model"),
            "analysis": analysis,
        },
        ensure_ascii=False,
    )
