from __future__ import annotations

import asyncio
import json
from functools import wraps

from agents import RunContextWrapper

from app.modules.marketing.browser.tools import (
    BrowserRunContext,
    _click_role,
    _mark_done,
    _observe,
    _resolve_role_locator,
)


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
async def test_observe_returns_url_and_aria_snapshot():
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
    assert "vision" not in payload
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


class _CountingLocator:
    def __init__(self, *, count: int, label: str):
        self._count = count
        self.label = label
        self.clicked = False

    async def count(self) -> int:
        return self._count

    @property
    def first(self) -> "_CountingLocator":
        return self

    async def click(self, timeout: int = 0) -> None:
        self.clicked = True


class _AmbiguousRolePage:
    """Mirrors Facebook: 'Add to your post' would substring-match name='Post'."""

    def __init__(self) -> None:
        self.exact_post = _CountingLocator(count=1, label="Post")
        self.fuzzy = _CountingLocator(count=2, label="Add to your post")
        self.calls: list[tuple[str, str, bool]] = []

    def get_by_role(self, role: str, *, name: str, exact: bool = False):
        self.calls.append((role, name, exact))
        if exact and name == "Post":
            return self.exact_post
        return self.fuzzy


@async_test
async def test_click_role_prefers_exact_post_over_add_to_your_post():
    page = _AmbiguousRolePage()
    locator = await _resolve_role_locator(page, role="button", name="Post", exact=False)
    assert locator is page.exact_post

    ctx = BrowserRunContext(
        page=page,
        email="a@example.com",
        password="secret",
        message="hola",
    )
    wrapper = RunContextWrapper(context=ctx)
    raw = await _click_role(
        wrapper, json.dumps({"role": "button", "name": "Post", "exact": False})
    )
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert page.exact_post.clicked is True
    assert page.fuzzy.clicked is False
