from __future__ import annotations

import asyncio
import json
from functools import wraps
from typing import Any

from agents import RunContextWrapper

from app.core.vision.ports import VisionAnalysisRequest, VisionAnalysisResult, VisionPort
from app.modules.marketing.browser.tools import (
    BrowserRunContext,
    _click_at,
    _mark_done,
    _observe,
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

    async def screenshot(self, **_kwargs: Any) -> bytes:
        return b"fake-png-bytes"

    @property
    def mouse(self) -> Any:
        return self

    async def click(self, x: int, y: int) -> None:
        self.last_click = (x, y)


class _StubVision(VisionPort):
    def analyze_json(self, request: VisionAnalysisRequest) -> VisionAnalysisResult:
        assert request.image_bytes == b"fake-png-bytes"
        return VisionAnalysisResult(
            data={
                "page_summary": "Facebook feed",
                "logged_in": True,
                "composer_visible": True,
                "targets": [
                    {
                        "purpose": "open_composer",
                        "label": "¿Qué estás pensando?",
                        "role": "textbox",
                        "x": 120,
                        "y": 240,
                    }
                ],
            },
            model="vision-stub",
            raw_text="{}",
        )


@async_test
async def test_observe_returns_aria_and_vision():
    ctx = BrowserRunContext(
        page=_FakePage(),
        email="a@example.com",
        password="secret",
        message="hola",
        vision=_StubVision(),
    )
    wrapper = RunContextWrapper(context=ctx)
    raw = await _observe(wrapper, "{}")
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert "URL: https://www.facebook.com/" in payload["snapshot"]
    assert "heading: Home" in payload["snapshot"]
    assert payload["vision_raw"]["composer_visible"] is True
    assert "observe" in ctx.steps


@async_test
async def test_click_at_uses_mouse_coordinates():
    page = _FakePage()
    ctx = BrowserRunContext(
        page=page,
        email="a@example.com",
        password="secret",
        message="hola",
    )
    wrapper = RunContextWrapper(context=ctx)
    raw = await _click_at(wrapper, json.dumps({"x": 10, "y": 20}))
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert page.last_click == (10, 20)


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
