import json

import pytest

from app.modules.assistant.agent.response_format import (
    ASSISTANT_JSON_RESPONSE_MARKER,
    AgentLLMResponse,
    PlanStep,
    apply_plan_update,
    build_tools_prompt_section,
    extract_partial_answer_content,
    format_tools_for_prompt,
    parse_agent_json_response,
    should_suppress_answer_stream,
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
        "skill_id": "menu_read",
        "content": "Tienes **3 categorías** activas.",
        "language": "es",
        "reason": "Categories already in context.",
    }
    parsed = parse_agent_json_response(json.dumps(payload))
    assert parsed.type == "answer"
    assert parsed.skill_id == "menu_read"
    assert parsed.content == "Tienes **3 categorías** activas."
    assert parsed.reason == "Categories already in context."


def test_parse_strips_markdown_fences():
    payload = json.dumps({"type": "answer", "content": "Hola", "language": "es"})
    parsed = parse_agent_json_response(f"```json\n{payload}\n```")
    assert parsed.type == "answer"
    assert parsed.content == "Hola"


def test_parse_coerces_plain_text_answer():
    parsed = parse_agent_json_response("Me llamo **Mark**.")
    assert parsed.type == "answer"
    assert parsed.content == "Me llamo **Mark**."
    assert parsed.language == "es"


def test_parse_rejects_empty_plain_text():
    with pytest.raises(ValueError):
        parse_agent_json_response("   ")


def test_parse_rejects_invalid_type():
    with pytest.raises(ValueError, match="type"):
        parse_agent_json_response(json.dumps({"type": "unknown"}))


def test_parse_normalizes_llm_field_aliases():
    payload = {
        "type": "toolcall",
        "skillid": "menuread",
        "tool": "listproducts",
        "args": {"limit": 20},
        "reason": "Need live catalog.",
    }
    parsed = parse_agent_json_response(
        json.dumps(payload),
        known_skill_ids={"menu_read"},
        known_tool_names={"list_products", "search_products"},
    )
    assert parsed.type == "tool_call"
    assert parsed.skill_id == "menu_read"
    assert parsed.tool == "list_products"
    assert parsed.args == {"limit": 20}


def test_parse_uses_first_object_when_llm_duplicates_json():
    duplicate = (
        '{"type":"toolcall","skillid":"menuread","tool":"listproducts","args":{"limit":20},'
        '"reason":"Need catalog."}'
        '{"type":"toolcall","skillid":"menuread","tool":"listproducts","args":{"limit":20},'
        '"reason":"Need catalog."}'
    )
    parsed = parse_agent_json_response(
        duplicate,
        known_skill_ids={"menu_read"},
        known_tool_names={"list_products"},
    )
    assert parsed.type == "tool_call"
    assert parsed.tool == "list_products"


def test_should_suppress_answer_stream_for_toolcall_alias():
    assert should_suppress_answer_stream('{"type":"toolcall"') is True


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
    assert '"skill_id"' in section


def test_extract_partial_answer_content_from_incomplete_json():
    buffer = '{"type":"answer","content":"Me llamo **Mark**.'
    assert extract_partial_answer_content(buffer) == "Me llamo **Mark**."


def test_extract_partial_answer_content_returns_none_for_tool_call():
    buffer = '{"type":"tool_call","skill_id":"menu_read","tool":"search_products"'
    assert extract_partial_answer_content(buffer) is None


def test_should_suppress_answer_stream_for_tool_call():
    assert should_suppress_answer_stream('{"type":"tool_call"') is True
    assert should_suppress_answer_stream('{"type":"answer","content":"Hola') is False


def test_parse_plan_response():
    payload = {
        "type": "plan",
        "skill_id": None,
        "steps": [
            {"id": 1, "goal": "List products", "tool_hint": "menu_read.list_products"},
            {"id": 2, "goal": "List promos"},
        ],
        "reason": "Multi-step task.",
    }
    parsed = parse_agent_json_response(json.dumps(payload))
    assert parsed.type == "plan"
    assert parsed.steps is not None
    assert [step.id for step in parsed.steps] == [1, 2]
    assert parsed.steps[0].status == "pending"


def test_parse_plan_update_normalizes_aliases():
    raw = '{"type":"planupdate","completedSteps":[1],"decision":"continue","reason":"done"}'
    parsed = parse_agent_json_response(raw)
    assert parsed.type == "plan_update"
    assert parsed.completed_step_ids == [1]
    assert parsed.decision == "continue"


def test_plan_requires_steps():
    with pytest.raises(ValueError):
        parse_agent_json_response('{"type":"plan","steps":[]}')


def test_plan_update_requires_decision():
    with pytest.raises(ValueError):
        parse_agent_json_response('{"type":"plan_update","completed_step_ids":[1]}')


def test_apply_plan_update_marks_completed():
    steps = [PlanStep(id=1, goal="a"), PlanStep(id=2, goal="b")]
    update = AgentLLMResponse(type="plan_update", decision="continue", completed_step_ids=[1])
    result = apply_plan_update(steps, update)
    assert result[0].status == "done"
    assert result[1].status == "pending"


def test_apply_plan_update_replaces_on_replan():
    steps = [PlanStep(id=1, goal="a")]
    update = AgentLLMResponse(
        type="plan_update",
        decision="replan",
        steps=[PlanStep(id=1, goal="x"), PlanStep(id=2, goal="y")],
    )
    result = apply_plan_update(steps, update)
    assert [step.goal for step in result] == ["x", "y"]


def test_planning_prompt_block_present_only_when_enabled():
    with_plan = build_tools_prompt_section([], planning_enabled=True, plan_max_steps=5)
    without_plan = build_tools_prompt_section([])
    assert '"type": "plan"' in with_plan
    assert '"type": "plan_update"' in with_plan
    assert '"type": "plan"' not in without_plan
