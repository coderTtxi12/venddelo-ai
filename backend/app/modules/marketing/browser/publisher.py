"""Facebook feed publisher via Playwright.

Install browsers after adding the dependency::

    cd backend && pip install playwright==1.49.1 && playwright install chromium
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)

# Facebook DOM selectors — fragile; first-match wins.
COMPOSER_SELECTORS = [
    '[aria-label="Create a post"]',
    '[aria-label="¿Qué estás pensando?"]',
    'div[role="button"][aria-label*="pensando"]',
]
MESSAGE_BOX = 'div[role="textbox"][contenteditable="true"]'
POST_BUTTONS = [
    '[aria-label="Post"]',
    '[aria-label="Publicar"]',
    'div[aria-label="Post"][role="button"]',
]
LOGIN_EMAIL = 'input[name="email"]'
LOGIN_PASS = 'input[name="pass"]'
LOGIN_SUBMIT = 'button[name="login"]'

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
                page.set_default_timeout(60_000)

                await page.goto(
                    "https://www.facebook.com/", wait_until="domcontentloaded"
                )

                if await _is_login_form_visible(page):
                    await page.fill(LOGIN_EMAIL, email)
                    await page.fill(LOGIN_PASS, password)
                    await page.click(LOGIN_SUBMIT)
                    await _wait_for_post_login(page)

                manual_error = await _detect_manual_intervention(page)
                if manual_error is not None:
                    new_state = await context.storage_state()
                    return PublishResult(
                        ok=False,
                        storage_state=new_state,
                        error=manual_error,
                        needs_manual_intervention=True,
                    )

                composer = await _first_visible_locator(page, COMPOSER_SELECTORS)
                if composer is None:
                    new_state = await context.storage_state()
                    return PublishResult(
                        ok=False,
                        storage_state=new_state,
                        error="Could not find feed composer",
                    )

                await composer.click()
                message_box = page.locator(MESSAGE_BOX).first
                await message_box.wait_for(state="visible")
                await message_box.fill(message)

                post_button = await _first_visible_locator(page, POST_BUTTONS)
                if post_button is None:
                    new_state = await context.storage_state()
                    return PublishResult(
                        ok=False,
                        storage_state=new_state,
                        error="Could not find post button",
                    )

                await post_button.click()
                await page.wait_for_timeout(3_000)

                manual_error = await _detect_manual_intervention(page)
                if manual_error is not None:
                    new_state = await context.storage_state()
                    return PublishResult(
                        ok=False,
                        storage_state=new_state,
                        error=manual_error,
                        needs_manual_intervention=True,
                    )

                new_state = await context.storage_state()
                return PublishResult(
                    ok=True,
                    storage_state=new_state,
                    result={"posted": True},
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


async def _wait_for_post_login(page, timeout_ms: int = 60_000) -> None:
    for selector in COMPOSER_SELECTORS:
        try:
            await page.locator(selector).first.wait_for(
                state="visible", timeout=timeout_ms
            )
            return
        except Exception:
            continue

    try:
        await page.wait_for_url(
            lambda url: "/login" not in url.lower(),
            timeout=timeout_ms,
        )
        return
    except Exception:
        pass

    await page.locator(LOGIN_EMAIL).first.wait_for(state="hidden", timeout=timeout_ms)


async def _first_visible_locator(page, selectors: list[str]):
    from playwright.async_api import Locator

    for selector in selectors:
        locator: Locator = page.locator(selector).first
        try:
            if await locator.is_visible():
                return locator
        except Exception:
            continue
    return None


async def _is_login_form_visible(page) -> bool:
    try:
        email = page.locator(LOGIN_EMAIL).first
        password = page.locator(LOGIN_PASS).first
        return await email.is_visible() and await password.is_visible()
    except Exception:
        return False


async def _detect_manual_intervention(page) -> str | None:
    url = page.url.lower()
    for fragment in CHALLENGE_URL_FRAGMENTS:
        if fragment in url:
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
