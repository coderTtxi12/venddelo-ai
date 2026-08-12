"""OpenAI Agents SDK tools for Facebook browser automation."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

from agents import FunctionTool, RunContextWrapper

from app.modules.marketing.browser.a11y import capture_aria_snapshot

logger = logging.getLogger(__name__)

Outcome = Literal["pending", "done", "needs_help"]

LOGIN_EMAIL = 'input[name="email"]'
LOGIN_PASS = 'input[name="pass"]'
LOGIN_SUBMIT = 'button[name="login"]'


@dataclass
class BrowserRunContext:
    page: Any
    email: str
    password: str
    message: str
    outcome: Outcome = "pending"
    summary: str | None = None
    error: str | None = None
    needs_manual_intervention: bool = False
    steps: list[str] = field(default_factory=list)


def _ok(**payload: Any) -> str:
    return json.dumps({"ok": True, **payload}, ensure_ascii=False)


def _err(error: str, **payload: Any) -> str:
    return json.dumps({"ok": False, "error": error, **payload}, ensure_ascii=False)


def build_browser_tools() -> list[FunctionTool]:
    return [
        FunctionTool(
            name="observe",
            description=(
                "Capture the current page URL and accessibility/ARIA tree. "
                "Call this before deciding the next action."
            ),
            params_json_schema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            on_invoke_tool=_observe,
        ),
        FunctionTool(
            name="click",
            description=(
                "Click an element by CSS/Playwright selector. Examples: "
                "'[aria-label=\"Publicar\"]', "
                "'div[role=\"textbox\"][contenteditable=\"true\"]'."
            ),
            params_json_schema={
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS or Playwright selector for the element",
                    },
                },
                "required": ["selector"],
                "additionalProperties": False,
            },
            on_invoke_tool=_click,
        ),
        FunctionTool(
            name="click_role",
            description=(
                "Click by accessible role + name (best for Facebook). "
                "Tries an exact name match first (so name='Post' does not hit "
                "'Add to your post'), then falls back to substring match. "
                "Examples: role=button name='Post'; role=button "
                "name=\"What's on your mind\"; role=button name='Publicar'."
            ),
            params_json_schema={
                "type": "object",
                "properties": {
                    "role": {
                        "type": "string",
                        "description": "ARIA role: button, textbox, link, etc.",
                    },
                    "name": {
                        "type": "string",
                        "description": "Accessible name / visible label",
                    },
                    "exact": {
                        "type": "boolean",
                        "default": False,
                        "description": (
                            "If true, only exact name match. If false (default), "
                            "try exact first then substring."
                        ),
                    },
                },
                "required": ["role", "name"],
                "additionalProperties": False,
            },
            on_invoke_tool=_click_role,
        ),
        FunctionTool(
            name="type_text",
            description=(
                "Type text into an element identified by selector. "
                "Use clear=true to replace existing content."
            ),
            params_json_schema={
                "type": "object",
                "properties": {
                    "selector": {"type": "string"},
                    "text": {"type": "string"},
                    "clear": {"type": "boolean", "default": True},
                },
                "required": ["selector", "text"],
                "additionalProperties": False,
            },
            on_invoke_tool=_type_text,
        ),
        FunctionTool(
            name="press_key",
            description="Press a keyboard key on the focused element or page (e.g. Enter, Escape).",
            params_json_schema={
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "selector": {
                        "type": "string",
                        "description": "Optional selector to focus before pressing",
                    },
                },
                "required": ["key"],
                "additionalProperties": False,
            },
            on_invoke_tool=_press_key,
        ),
        FunctionTool(
            name="wait",
            description="Wait a number of milliseconds for UI to settle.",
            params_json_schema={
                "type": "object",
                "properties": {
                    "milliseconds": {
                        "type": "integer",
                        "minimum": 100,
                        "maximum": 15000,
                    },
                },
                "required": ["milliseconds"],
                "additionalProperties": False,
            },
            on_invoke_tool=_wait,
        ),
        FunctionTool(
            name="login_if_needed",
            description=(
                "If a Facebook login form is visible, fill credentials from the "
                "secure server context and submit. Do not invent credentials. "
                "Call this when you see email/password fields."
            ),
            params_json_schema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            on_invoke_tool=_login_if_needed,
        ),
        FunctionTool(
            name="mark_done",
            description=(
                "Call when the feed post was successfully published (or you are "
                "confident it was). Ends the agent loop."
            ),
            params_json_schema={
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                },
                "required": ["summary"],
                "additionalProperties": False,
            },
            on_invoke_tool=_mark_done,
        ),
        FunctionTool(
            name="mark_needs_help",
            description=(
                "Call when blocked by captcha, 2FA, checkpoint, or unrecoverable UI. "
                "Ends the agent loop and flags the account for manual intervention."
            ),
            params_json_schema={
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                },
                "required": ["reason"],
                "additionalProperties": False,
            },
            on_invoke_tool=_mark_needs_help,
        ),
    ]


def _finished_guard(browser: BrowserRunContext) -> str | None:
    if browser.outcome == "pending":
        return None
    return _err(f"agent already finished with outcome={browser.outcome}")


async def _observe(ctx: RunContextWrapper[BrowserRunContext], _args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    snapshot = await capture_aria_snapshot(browser.page)
    browser.steps.append("observe")
    return _ok(snapshot=snapshot)


async def _click(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    data = json.loads(args or "{}")
    selector = str(data.get("selector") or "").strip()
    if not selector:
        return _err("selector is required")
    try:
        locator = browser.page.locator(selector).first
        await locator.click(timeout=15_000)
        browser.steps.append(f"click:{selector}")
        return _ok(clicked=selector)
    except Exception as exc:
        return _err(str(exc), selector=selector)


async def _resolve_role_locator(page: Any, *, role: str, name: str, exact: bool) -> Any:
    """Prefer exact accessible-name match so 'Post' != 'Add to your post'."""
    exact_locator = page.get_by_role(role, name=name, exact=True)
    if exact:
        return exact_locator.first
    try:
        if await exact_locator.count() > 0:
            return exact_locator.first
    except Exception:
        pass
    return page.get_by_role(role, name=name, exact=False).first


async def _click_role(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    data = json.loads(args or "{}")
    role = str(data.get("role") or "").strip()
    name = str(data.get("name") or "").strip()
    exact = bool(data.get("exact", False))
    if not role or not name:
        return _err("role and name are required")
    try:
        locator = await _resolve_role_locator(
            browser.page, role=role, name=name, exact=exact
        )
        await locator.click(timeout=15_000)
        browser.steps.append(f"click_role:{role}:{name}")
        return _ok(clicked_role=role, name=name)
    except Exception as exc:
        return _err(str(exc), role=role, name=name)


async def _type_text(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    data = json.loads(args or "{}")
    selector = str(data.get("selector") or "").strip()
    text = data.get("text")
    clear = bool(data.get("clear", True))
    if not selector:
        return _err("selector is required")
    if not isinstance(text, str):
        return _err("text is required")
    try:
        locator = browser.page.locator(selector).first
        await locator.wait_for(state="visible", timeout=15_000)
        if clear:
            await locator.fill(text)
        else:
            await locator.click()
            await locator.type(text)
        browser.steps.append(f"type:{selector}")
        return _ok(typed_into=selector, length=len(text))
    except Exception as exc:
        return _err(str(exc), selector=selector)


async def _press_key(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    data = json.loads(args or "{}")
    key = str(data.get("key") or "").strip()
    selector = str(data.get("selector") or "").strip() or None
    if not key:
        return _err("key is required")
    try:
        if selector:
            await browser.page.locator(selector).first.press(key)
        else:
            await browser.page.keyboard.press(key)
        browser.steps.append(f"press:{key}")
        return _ok(key=key)
    except Exception as exc:
        return _err(str(exc), key=key)


async def _wait(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    data = json.loads(args or "{}")
    ms = int(data.get("milliseconds") or 0)
    ms = max(100, min(ms, 15_000))
    await browser.page.wait_for_timeout(ms)
    browser.steps.append(f"wait:{ms}")
    return _ok(waited_ms=ms)


async def _find_login_fields(page: Any) -> tuple[Any, Any, Any] | None:
    """Return (email, password, submit) locators if a login form looks visible."""
    candidates = [
        (
            page.locator(LOGIN_EMAIL).first,
            page.locator(LOGIN_PASS).first,
            page.locator(LOGIN_SUBMIT).first,
        ),
        (
            page.get_by_role("textbox", name="Correo electrónico o número de celular").first,
            page.get_by_role("textbox", name="Contraseña").first,
            page.get_by_role("button", name="Iniciar sesión").first,
        ),
        (
            page.get_by_role("textbox", name="Email or phone number").first,
            page.get_by_role("textbox", name="Password").first,
            page.get_by_role("button", name="Log in").first,
        ),
    ]
    for email, password, submit in candidates:
        try:
            if await email.is_visible() and await password.is_visible():
                return email, password, submit
        except Exception:
            continue
    return None


async def _login_if_needed(ctx: RunContextWrapper[BrowserRunContext], _args: str) -> str:
    browser = ctx.context
    if blocked := _finished_guard(browser):
        return blocked
    page = browser.page
    fields = await _find_login_fields(page)
    if fields is None:
        browser.steps.append("login_if_needed:not_needed")
        return _ok(logged_in=False, reason="login form not visible")

    email, password, submit = fields
    try:
        await email.fill(browser.email)
        await password.fill(browser.password)
        await submit.click(timeout=15_000)
        await page.wait_for_timeout(2_000)
        browser.steps.append("login_if_needed:submitted")
        # Never return credentials.
        return _ok(logged_in=True, submitted=True)
    except Exception:
        logger.warning("login_if_needed failed")
        return _err("login submit failed")


async def _mark_done(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    data = json.loads(args or "{}")
    summary = str(data.get("summary") or "posted").strip()
    browser = ctx.context
    browser.outcome = "done"
    browser.summary = summary
    browser.steps.append("mark_done")
    return _ok(outcome="done", summary=summary)


async def _mark_needs_help(ctx: RunContextWrapper[BrowserRunContext], args: str) -> str:
    data = json.loads(args or "{}")
    reason = str(data.get("reason") or "manual intervention required").strip()
    browser = ctx.context
    browser.outcome = "needs_help"
    browser.error = reason
    browser.needs_manual_intervention = True
    browser.steps.append("mark_needs_help")
    return _ok(outcome="needs_help", reason=reason)
