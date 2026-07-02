from app.modules.assistant.agent.response_format import (
    LOAD_SKILL_TOOL_NAME,
    AssistantTurnStreamParser,
    build_agent_runtime_section,
    build_load_skill_schema,
    build_openai_tool_schemas,
    openai_function_name,
    parse_agent_response,
    parse_function_name,
)
from app.modules.assistant.skills.base import ToolDefinition


def test_function_name_roundtrip():
    name = openai_function_name("menu_read", "search_products")
    assert name == "menu_read__search_products"
    assert parse_function_name(name) == ("menu_read", "search_products")


def test_parse_function_name_without_separator():
    assert parse_function_name("load_skill") == (None, "load_skill")


def test_build_openai_tool_schemas_marks_effect_and_uses_function_name():
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
        ),
        (
            "menu_write",
            ToolDefinition(
                name="update_product",
                description="Update a product.",
                effect="mutate",
                input_schema={"type": "object", "properties": {}},
            ),
        ),
    ]
    schemas = build_openai_tool_schemas(tools)
    names = [s["function"]["name"] for s in schemas]
    assert names == ["menu_read__search_products", "menu_write__update_product"]
    assert schemas[0]["type"] == "function"
    assert schemas[0]["function"]["parameters"]["required"] == ["query"]
    assert schemas[1]["function"]["description"].startswith("[MUTATE]")


def test_build_load_skill_schema_enumerates_skills():
    schema = build_load_skill_schema(["menu_read", "menu_write"])
    assert schema["function"]["name"] == LOAD_SKILL_TOOL_NAME
    props = schema["function"]["parameters"]["properties"]
    assert props["skill_id"]["enum"] == ["menu_read", "menu_write"]


def test_runtime_section_has_style_and_tool_guidance():
    section = build_agent_runtime_section()
    assert "load_skill" in section
    assert "reasoning" in section
    assert "content" in section
    assert "Never delete" in section


def test_parse_agent_response_extracts_envelope():
    raw = (
        '{"reasoning": "Revisé el menú.", '
        '"content": "Tienes **3 tacos** activos."}'
    )
    parsed = parse_agent_response(raw)
    assert parsed["reasoning"] == "Revisé el menú."
    assert parsed["content"] == "Tienes **3 tacos** activos."


def test_parse_agent_response_strips_code_fence():
    raw = '```json\n{"reasoning": "Ok", "content": "Hola"}\n```'
    parsed = parse_agent_response(raw)
    assert parsed == {"reasoning": "Ok", "content": "Hola"}


def test_parse_agent_response_falls_back_to_plain_text():
    parsed = parse_agent_response("Respuesta directa en Markdown.")
    assert parsed["reasoning"] == ""
    assert parsed["content"] == "Respuesta directa en Markdown."


def test_parse_agent_response_recovers_malformed_json_envelope():
    raw = (
        '{"reasoning": "Revisé la descripción actual de HAMBURGUESA.", '
        '"content": "HAMBURGUESA - Opciones\\n\\nOpción A\\n- Clásica con salsa especial.'
        '\\n\\n¿Cuál opción te gustaría que aplique?"]}'
    )
    parsed = parse_agent_response(raw)
    assert parsed["reasoning"] == "Revisé la descripción actual de HAMBURGUESA."
    assert parsed["content"].startswith("HAMBURGUESA - Opciones")
    assert "Opción A" in parsed["content"]
    assert parsed["content"].endswith("¿Cuál opción te gustaría que aplique?")
    assert "reasoning" not in parsed["content"]


def test_stream_parser_emits_plain_reasoning_before_tools():
    parser = AssistantTurnStreamParser()
    events = parser.feed("Voy a buscar tacos al pastor.")
    assert parser.is_json_mode is False
    assert events
    assert events[0]["event"] == "thought"
    assert "buscar" in str(events[0]["text"])


def test_stream_parser_streams_json_content_incrementally():
    parser = AssistantTurnStreamParser()
    chunks = [
        '{"reasoning":"Revisé el menú.",',
        '"content":"Hola **Mark**',
        ' aquí."}',
    ]
    content_deltas: list[str] = []
    thought_events: list[dict[str, object]] = []
    for chunk in chunks:
        for event in parser.feed(chunk):
            if event["event"] == "content_delta":
                content_deltas.append(str(event["delta"]))
            elif event["event"] == "thought":
                thought_events.append(event)
    assert "".join(content_deltas) == "Hola **Mark** aquí."
    assert not thought_events
