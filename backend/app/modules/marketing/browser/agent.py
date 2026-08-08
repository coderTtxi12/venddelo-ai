"""OpenAI Agents SDK loop: observe → decide → act on Facebook via Playwright."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from agents import Agent, Runner, trace

from app.core.config import Settings, get_settings
from app.modules.assistant.agent.model_settings import build_assistant_model_settings
from app.modules.marketing.browser.tools import BrowserRunContext, build_browser_tools
from app.modules.marketing.browser.tracing import ensure_marketing_agent_tracing

logger = logging.getLogger(__name__)

FACEBOOK_BROWSER_MAX_TURNS = 24

INSTRUCTIONS = """
You are a browser agent controlling a Playwright page on Facebook.
Your ONLY goal is to publish the given message as a new post on the user's feed.

Rules:
1. Always call observe first (and again after significant UI changes).
2. Use the accessibility/ARIA tree to choose selectors (roles, names, aria-labels).
3. Prefer Spanish and English UI labels (Publicar / Post, ¿Qué estás pensando? / What's on your mind?).
4. If you see a login form (email/password), call login_if_needed — never invent credentials.
5. After login, dismiss cookie/consent dialogs if they block the composer.
6. Open the feed composer, type the exact message provided, then click Publicar/Post.
7. When the post is published (composer closed or success UI), call mark_done.
8. If you hit captcha, 2FA, checkpoint, or are stuck, call mark_needs_help with a short reason.
9. Do not navigate away from Facebook. Do not message other users. Do not change settings.
10. Keep actions minimal; avoid unnecessary waits.
""".strip()


@dataclass
class BrowserAgentResult:
    ok: bool
    summary: str | None = None
    error: str | None = None
    needs_manual_intervention: bool = False
    steps: list[str] | None = None


async def run_facebook_feed_publish_agent(
    *,
    page: Any,
    email: str,
    password: str,
    message: str,
    settings: Settings | None = None,
) -> BrowserAgentResult:
    settings = settings or get_settings()
    if settings.openai_api_key:
        os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key)

    ensure_marketing_agent_tracing(settings)

    browser_ctx = BrowserRunContext(
        page=page,
        email=email,
        password=password,
        message=message,
    )
    tools = build_browser_tools()
    agent = Agent[BrowserRunContext](
        name="FacebookBrowserAgent",
        instructions=INSTRUCTIONS,
        tools=tools,
        model=settings.openai_model,
        model_settings=build_assistant_model_settings(
            settings,
            parallel_tool_calls=False,
        ),
    )

    prompt = (
        "Publish this exact message to the Facebook feed:\n\n"
        f"{message}\n\n"
        "Start by observing the page, then take actions until the post is published."
    )

    try:
        with trace(
            "facebook_feed_publish",
            metadata={
                "component": "marketing_facebook_browser_agent",
                "message_length": str(len(message)),
            },
        ):
            await Runner.run(
                agent,
                prompt,
                context=browser_ctx,
                max_turns=FACEBOOK_BROWSER_MAX_TURNS,
            )
    except Exception as exc:
        logger.exception("facebook browser agent failed")
        if browser_ctx.outcome == "pending":
            return BrowserAgentResult(
                ok=False,
                error=_safe_agent_error(exc),
                needs_manual_intervention=False,
                steps=list(browser_ctx.steps),
            )

    if browser_ctx.outcome == "done":
        return BrowserAgentResult(
            ok=True,
            summary=browser_ctx.summary or "posted",
            steps=list(browser_ctx.steps),
        )
    if browser_ctx.outcome == "needs_help":
        return BrowserAgentResult(
            ok=False,
            error=browser_ctx.error or "needs manual intervention",
            needs_manual_intervention=True,
            steps=list(browser_ctx.steps),
        )
    return BrowserAgentResult(
        ok=False,
        error="Agent finished without mark_done (max turns or stalled)",
        steps=list(browser_ctx.steps),
    )


def _safe_agent_error(exc: BaseException) -> str:
    message = str(exc).strip() or "Browser agent error"
    lowered = message.lower()
    if "@" in message or "password" in lowered or "email" in lowered:
        return "Browser agent error"
    return message
