import json

import pytest

from app.modules.assistant.agent.response_format import (
    ASSISTANT_JSON_RESPONSE_MARKER,
    build_tools_prompt_section,
    format_tools_for_prompt,
    parse_agent_json_response,
)
from app.modules.assistant.skills.base import ToolDefinition


def test_parse_tool_call_response():
    payload = {
        "type": "tool_call",
        "skill_id": "menu_read",
        "tool": "search_products",
        "args": {"query": "pastor"},
    }
    parsed = parse_agent_json_response(json.dumps(payload))
    assert parsed.type == "tool_call"
    assert parsed.skill_id == "menu_read"
    assert parsed.tool == "search_products"
    assert parsed.args == {"query": "pastor"}


def test_parse_answer_response():
    payload = {
        "type": "answer",
        "content": "Tienes **3 categorías** activas.",
        "language": "es",
    }
    parsed = parse_agent_json_response(json.dumps(payload))
    assert parsed.type == "answer"
    assert parsed.content == "Tienes **3 categorías** activas."
    assert parsed.language == "es"


def test_parse_strips_markdown_fences():
    payload = json.dumps({"type": "answer", "content": "Hola", "language": "es"})
    parsed = parse_agent_json_response(f"```json\n{payload}\n```")
    assert parsed.type == "answer"
    assert parsed.content == "Hola"


def test_parse_rejects_invalid_type():
    with pytest.raises(ValueError, match="type"):
        parse_agent_json_response(json.dumps({"type": "unknown"}))


def test_format_tools_for_prompt_includes_skill_and_schema():
    tools = [
        (
            "menu_read",
            ToolDefinition(
                name="search_products",
                description="Search products by name.",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
        )
    ]
    section = format_tools_for_prompt(tools)
    assert "menu_read.search_products" in section
    assert "Search products by name." in section
    assert '"query"' in section


def test_build_tools_prompt_section_includes_marker_and_examples():
    section = build_tools_prompt_section([])
    assert ASSISTANT_JSON_RESPONSE_MARKER in section
    assert '"type": "tool_call"' in section
    assert '"type": "answer"' in section
