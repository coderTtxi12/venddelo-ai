from unittest.mock import MagicMock
import uuid

from app.modules.assistant.agent.workflow.context_loader import (
    _build_conversation_history,
    menu_subagent_input,
    orchestrator_input,
    resolve_runtime_skill_ids,
    restaurant_ops_input,
)
from app.modules.assistant.schemas import AssistantChatHistoryMessage
from app.modules.assistant.agent.workflow.context_loader import WorkflowContext
from app.modules.assistant.agent.workflow.schemas import (
    ExecutionRecord,
    clear_execution_approval_gates,
)


def test_resolve_runtime_skill_ids_intersects_discovered_skills():
    effective = resolve_runtime_skill_ids(
        ["menu_read", "menu_write", "unknown_skill"],
        rollout_skill_ids=None,
    )
    assert "menu_read" in effective
    assert "menu_write" in effective
    assert "unknown_skill" not in effective


def test_resolve_runtime_skill_ids_honors_rollout_cap():
    effective = resolve_runtime_skill_ids(
        ["menu_read", "menu_write"],
        rollout_skill_ids=("menu_read",),
    )
    assert effective == ["menu_read"]


def test_clear_execution_approval_gates():
    execution = ExecutionRecord(
        requires_user_approval=True,
        approval_reason="Esperando confirmación",
    )
    cleared_execution = clear_execution_approval_gates(execution)
    assert cleared_execution.requires_user_approval is False
    assert cleared_execution.approval_reason is None


def _base_context(**overrides) -> WorkflowContext:
    data = dict(
        user_message="Hola",
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        effective_skill_ids=["menu_read"],
        skill_catalog="- **menu_read**: read",
        system_prompt="sys",
        conversation_history="(sin historial previo en esta conversación)",
        assistant_display_name="Luna",
    )
    data.update(overrides)
    return WorkflowContext(**data)


def test_orchestrator_input_is_history_and_user_request_only():
    context = _base_context(
        menu_import_enabled=True,
        import_session_context="Sesión activa en extracción",
        user_message="Hola",
    )
    payload = orchestrator_input(context)
    assert "## Conversation history" in payload
    assert "## User request" in payload
    assert "Hola" in payload
    assert "## Active menu import session" not in payload
    assert "Menu import capability" not in payload


def test_orchestrator_instructions_include_parallel_tool_calls():
    from app.modules.assistant.agent.workflow.prompts import ORCHESTRATOR_INSTRUCTIONS

    assert "Parallel tool calls" in ORCHESTRATOR_INSTRUCTIONS


def test_restaurant_ops_input_includes_delegated_task():
    context = _base_context(user_message="desactiva el producto hamburguesa")
    payload = restaurant_ops_input(context, "Listar categorías del menú")
    assert "## Delegated task" in payload
    assert "Listar categorías del menú" in payload
    assert "## User request" not in payload
    assert "hamburguesa" not in payload
    assert "## Conversation history" not in payload


def test_menu_subagent_input_includes_session_and_task():
    context = _base_context(
        menu_import_enabled=True,
        menu_import_conversation_history="Usuario: importa",
        import_session_context="fase=collecting",
        menu_source_attachment_count=1,
    )
    payload = menu_subagent_input(context, "Importar menú desde PDF")
    assert "## Delegated task" in payload
    assert "## Import session" in payload
    assert "solo" in payload


def test_format_history_strips_chat_attachments_from_user_messages():
    from app.modules.assistant.agent.workflow.context_loader import _format_history
    from app.modules.assistant.schemas import AssistantChatHistoryMessage

    rendered = _format_history(
        [
            AssistantChatHistoryMessage(
                role="user",
                content=(
                    "sube este menu\n\n## Chat attachments\n\n"
                    "- **menu.png** (`menu_source`)"
                ),
            )
        ]
    )

    assert rendered == "Usuario: sube este menu"


def test_build_conversation_history_uses_message_limit_without_compression(monkeypatch):
    import asyncio

    from app.core.config import Settings

    captured: dict[str, int] = {}

    def fake_load_recent_history(repo, conversation_id, *, settings=None, message_limit=None):
        captured["limit"] = message_limit
        return [AssistantChatHistoryMessage(role="user", content="hola")]

    async def fake_compress_history_for_llm(*args, **kwargs):
        raise AssertionError("should not compress")

    monkeypatch.setattr(
        "app.modules.assistant.agent.workflow.context_loader.load_recent_history",
        fake_load_recent_history,
    )
    monkeypatch.setattr(
        "app.modules.assistant.agent.workflow.context_loader.compress_history_for_llm",
        fake_compress_history_for_llm,
    )

    settings = Settings(assistant_router_llm_context_message_limit=12)
    rendered = asyncio.run(
        _build_conversation_history(
            MagicMock(),
            uuid.uuid4(),
            settings=settings,
            system_prompt="sys",
            user_message="user",
            message_limit=settings.assistant_router_llm_context_message_limit,
            apply_compression=False,
        )
    )

    assert captured["limit"] == 12
    assert rendered == "Usuario: hola"
