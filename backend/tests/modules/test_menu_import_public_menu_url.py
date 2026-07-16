from app.core.config import Settings
from app.modules.assistant.agent.workflow.schemas import ExecutionRecord
from app.modules.assistant.skills.menu_import.public_menu_url import (
    build_public_menu_url,
    format_public_menu_link_block,
    import_session_applied_to_live,
    should_inject_public_menu_url_for_responder,
)


class _FakeSession:
    def __init__(self, *, draft_batches=None):
        self.draft_batches = draft_batches or []


def test_public_menu_url_dev_uses_subdomain_localhost():
    settings = Settings(app_env="dev", cors_origins="http://localhost:3000")
    url = build_public_menu_url("tacos-centro", settings=settings)
    assert url == "http://tacos-centro.localhost:3000"


def test_public_menu_url_production_uses_subdomain():
    settings = Settings(app_env="production", menu_public_domain="mxy.mx")
    url = build_public_menu_url("wild-rooster", settings=settings)
    assert url == "https://wild-rooster.mxy.mx"


def test_public_menu_url_vercel_uses_path_routing():
    settings = Settings(
        app_env="production",
        menu_public_domain="venddelo-ai.vercel.app",
        cors_origins="https://venddelo-ai.vercel.app",
    )
    url = build_public_menu_url("wild-rooster", settings=settings)
    assert url == "https://venddelo-ai.vercel.app/menu/wild-rooster"


def test_import_session_applied_to_live():
    assert not import_session_applied_to_live(None)
    assert not import_session_applied_to_live(_FakeSession(draft_batches=[{"batch_index": 0}]))
    assert import_session_applied_to_live(
        _FakeSession(draft_batches=[{"batch_index": 0, "applied_at": "2026-01-01T00:00:00Z"}])
    )


def test_should_inject_public_menu_url_for_responder():
    applied = _FakeSession(draft_batches=[{"applied_at": "2026-01-01T00:00:00Z"}])
    assert should_inject_public_menu_url_for_responder(
        applied,
        pending_quiz=False,
        execution_status="success",
        tools_used=["model_working_draft"],
    )
    assert not should_inject_public_menu_url_for_responder(
        applied,
        pending_quiz=True,
        execution_status="success",
        tools_used=["model_working_draft"],
    )
    assert not should_inject_public_menu_url_for_responder(
        applied,
        pending_quiz=False,
        execution_status="failed",
        tools_used=["model_working_draft"],
    )
    assert not should_inject_public_menu_url_for_responder(
        applied,
        pending_quiz=False,
        execution_status="success",
        tools_used=["get_import_session"],
    )


def test_format_public_menu_link_block():
    block = format_public_menu_link_block("https://tacos.example/menu")
    assert "## Public menu link" in block
    assert "https://tacos.example/menu" in block
