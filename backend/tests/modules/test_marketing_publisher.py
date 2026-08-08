import asyncio
import sys
from functools import wraps
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

from app.modules.marketing.browser.publisher import (
    PlaywrightFacebookFeedPublisher,
    _capture_storage_state,
    _detect_manual_intervention_url,
)


def async_test(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))

    return wrapper


def _install_fake_playwright(mock_cm):
    fake_async_api = ModuleType("playwright.async_api")
    fake_async_api.async_playwright = MagicMock(return_value=mock_cm)
    fake_playwright = ModuleType("playwright")
    fake_playwright.async_api = fake_async_api
    return {
        "playwright": fake_playwright,
        "playwright.async_api": fake_async_api,
    }


def _playwright_mocks(*, launch_side_effect=None, goto_side_effect=None):
    captured_state = {"cookies": [{"name": "c", "value": "v"}], "origins": []}

    mock_page = AsyncMock()
    mock_page.url = "https://www.facebook.com/"
    mock_page.goto = AsyncMock(side_effect=goto_side_effect or RuntimeError("boom"))
    mock_page.set_default_timeout = MagicMock()

    mock_context = AsyncMock()
    mock_context.storage_state = AsyncMock(return_value=captured_state)
    mock_context.new_page = AsyncMock(return_value=mock_page)

    mock_browser = AsyncMock()
    mock_browser.new_context = AsyncMock(return_value=mock_context)
    if launch_side_effect is not None:
        mock_browser_launch = AsyncMock(side_effect=launch_side_effect)
    else:
        mock_browser_launch = AsyncMock(return_value=mock_browser)

    mock_playwright = AsyncMock()
    mock_playwright.chromium.launch = mock_browser_launch

    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_playwright)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    return mock_cm, captured_state


@async_test
async def test_publisher_exception_returns_storage_state_when_context_exists():
    mock_cm, captured_state = _playwright_mocks()

    with patch.dict(sys.modules, _install_fake_playwright(mock_cm)):
        publisher = PlaywrightFacebookFeedPublisher()
        result = await publisher.publish(
            email="e@example.com",
            password="secret",
            storage_state=None,
            message="hello",
        )

    assert result.ok is False
    assert result.storage_state == captured_state
    assert result.error == "boom"


@async_test
async def test_publisher_exception_returns_no_storage_state_without_context():
    mock_cm, _ = _playwright_mocks(launch_side_effect=RuntimeError("launch failed"))

    with patch.dict(sys.modules, _install_fake_playwright(mock_cm)):
        publisher = PlaywrightFacebookFeedPublisher()
        result = await publisher.publish(
            email="e@example.com",
            password="secret",
            storage_state=None,
            message="hello",
        )

    assert result.ok is False
    assert result.storage_state is None
    assert result.error == "launch failed"


@async_test
async def test_capture_storage_state_handles_missing_context():
    assert await _capture_storage_state(None) is None


def test_detect_manual_intervention_uses_checkpoint_url_only():
    assert _detect_manual_intervention_url(
        "https://www.facebook.com/checkpoint/?next"
    ) is not None
    assert _detect_manual_intervention_url("https://www.facebook.com/") is None


@async_test
async def test_publisher_uses_llm_agent_result():
    from app.modules.marketing.browser.agent import BrowserAgentResult

    captured_state = {"cookies": [{"name": "c", "value": "v"}], "origins": []}
    mock_page = AsyncMock()
    mock_page.url = "https://www.facebook.com/"
    mock_page.goto = AsyncMock()
    mock_page.set_default_timeout = MagicMock()
    mock_context = AsyncMock()
    mock_context.storage_state = AsyncMock(return_value=captured_state)
    mock_context.new_page = AsyncMock(return_value=mock_page)
    mock_browser = AsyncMock()
    mock_browser.new_context = AsyncMock(return_value=mock_context)
    mock_playwright = AsyncMock()
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_playwright)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    fake_result = BrowserAgentResult(
        ok=True,
        summary="posted",
        steps=["observe", "mark_done"],
    )

    with (
        patch.dict(sys.modules, _install_fake_playwright(mock_cm)),
        patch(
            "app.modules.marketing.browser.agent.run_facebook_feed_publish_agent",
            new=AsyncMock(return_value=fake_result),
        ),
    ):
        publisher = PlaywrightFacebookFeedPublisher()
        result = await publisher.publish(
            email="e@example.com",
            password="secret",
            storage_state=None,
            message="hello",
        )

    assert result.ok is True
    assert result.storage_state == captured_state
    assert result.result["posted"] is True