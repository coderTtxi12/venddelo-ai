from __future__ import annotations

import asyncio
import json
from functools import wraps

from agents import RunContextWrapper

from app.modules.marketing.browser.tools import BrowserRunContext, _mark_done, _observe


def async_test(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))

    return wrapper


class _FakeLocator:
    def __init__(self, snapshot: str = "- heading: Home"):
        self._snapshot = snapshot

    async def aria_snapshot(self) -> str:
        return self._snapshot


class _FakePage:
    url = "https://www.facebook.com/"

    def locator(self, _selector: str) -> _FakeLocator:
        return _FakeLocator()


@async_test
async def test_observe_returns_url_and_snapshot():
    ctx = BrowserRunContext(
        page=_FakePage(),
        email="a@example.com",
        password="secret",
        message="hola",
    )
    wrapper = RunContextWrapper(context=ctx)
    raw = await _observe(wrapper, "{}")
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert "URL: https://www.facebook.com/" in payload["snapshot"]
    assert "heading: Home" in payload["snapshot"]
    assert "observe" in ctx.steps


@async_test
async def test_mark_done_sets_outcome():
    ctx = BrowserRunContext(
        page=_FakePage(),
        email="a@example.com",
        password="secret",
        message="hola",
    )
    wrapper = RunContextWrapper(context=ctx)
    raw = await _mark_done(wrapper, json.dumps({"summary": "posted ok"}))
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert ctx.outcome == "done"
    assert ctx.summary == "posted ok"


@async_test
async def test_observe_blocked_after_done():
    ctx = BrowserRunContext(
        page=_FakePage(),
        email="a@example.com",
        password="secret",
        message="hola",
        outcome="done",
    )
    wrapper = RunContextWrapper(context=ctx)
    raw = await _observe(wrapper, "{}")
    payload = json.loads(raw)
    assert payload["ok"] is False
