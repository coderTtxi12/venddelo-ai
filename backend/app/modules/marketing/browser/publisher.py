"""Facebook feed publisher via Playwright + LLM browser agent.

Install browsers after adding the dependency::

    cd backend && pip install playwright==1.62.0 && playwright install chromium
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)

CHALLENGE_URL_FRAGMENTS = (
    "checkpoint",
    "login/device-based",
    "login/help",
    "two_step_verification",
    "recover",
)


@dataclass
class PublishResult:
    ok: bool
    storage_state: dict[str, Any] | None
    error: str | None = None
    needs_manual_intervention: bool = False
    result: dict[str, Any] | None = None


class FacebookFeedPublisher(Protocol):
    async def publish(
        self,
        *,
        email: str,
        password: str,
        storage_state: dict[str, Any] | None,
        message: str,
    ) -> PublishResult: ...


class StubFacebookFeedPublisher:
    async def publish(
        self,
        *,
        email: str,
        password: str,
        storage_state: dict[str, Any] | None,
        message: str,
    ) -> PublishResult:
        return PublishResult(ok=False, storage_state=None, error="publisher not wired")


class PlaywrightFacebookFeedPublisher:
    """Launch Chromium, restore session, then let the Agents SDK browser agent publish."""

    async def publish(
        self,
        *,
        email: str,
        password: str,
        storage_state: dict[str, Any] | None,
        message: str,
    ) -> PublishResult:
        from playwright.async_api import async_playwright

        from app.core.config import get_settings
        from app.modules.marketing.browser.agent import run_facebook_feed_publish_agent

        settings = get_settings()
        headless = not settings.marketing_playwright_headed

        context = None
        browser = None
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=headless)
                context = await browser.new_context(
                    storage_state=storage_state if storage_state else None
                )
                page = await context.new_page()
                page.set_default_timeout(30_000)

                await page.goto(
                    "https://www.facebook.com/", wait_until="domcontentloaded"
                )

                manual_error = _detect_manual_intervention_url(page.url)
                if manual_error is not None:
                    new_state = await context.storage_state()
                    return PublishResult(
                        ok=False,
                        storage_state=new_state,
                        error=manual_error,
                        needs_manual_intervention=True,
                    )

                agent_result = await run_facebook_feed_publish_agent(
                    page=page,
                    email=email,
                    password=password,
                    message=message,
                    settings=settings,
                )
                new_state = await context.storage_state()

                if agent_result.ok:
                    return PublishResult(
                        ok=True,
                        storage_state=new_state,
                        result={
                            "posted": True,
                            "summary": agent_result.summary,
                            "steps": agent_result.steps or [],
                        },
                    )

                return PublishResult(
                    ok=False,
                    storage_state=new_state,
                    error=agent_result.error or "Browser agent failed",
                    needs_manual_intervention=agent_result.needs_manual_intervention,
                    result={"steps": agent_result.steps or []},
                )
        except Exception as exc:
            logger.exception("playwright facebook publish failed")
            captured_state = await _capture_storage_state(context)
            return PublishResult(
                ok=False,
                storage_state=captured_state,
                error=_safe_error_message(exc),
            )
        finally:
            if browser is not None:
                try:
                    await browser.close()
                except Exception:
                    logger.debug("failed to close playwright browser", exc_info=True)


async def _capture_storage_state(context) -> dict[str, Any] | None:
    if context is None:
        return None
    try:
        return await context.storage_state()
    except Exception:
        logger.debug("could not capture storage_state after publish failure", exc_info=True)
        return None


def _detect_manual_intervention_url(url: str) -> str | None:
    lowered = (url or "").lower()
    for fragment in CHALLENGE_URL_FRAGMENTS:
        if fragment in lowered:
            return f"Facebook challenge detected: {fragment}"
    return None


def _safe_error_message(exc: BaseException) -> str:
    message = str(exc).strip()
    if not message:
        return "Publisher error"
    lowered = message.lower()
    if "@" in message or "password" in lowered or "email" in lowered:
        return "Publisher error"
    return message
