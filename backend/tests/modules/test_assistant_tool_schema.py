from app.modules.assistant.agent.tool_schema import coerce_tool_args, normalize_tool_json_schema


def test_normalize_free_form_object_becomes_json_string():
    schema = {
        "type": "object",
        "properties": {
            "answers": {
                "type": "object",
                "description": "Key-value discovery answers from the owner.",
            },
        },
        "required": ["answers"],
    }

    normalized, json_keys = normalize_tool_json_schema(schema)

    assert normalized["additionalProperties"] is False
    assert normalized["required"] == ["answers"]
    assert normalized["properties"]["answers"]["type"] == "string"
    assert "JSON object string" in normalized["properties"]["answers"]["description"]
    assert json_keys == frozenset({"answers"})


def test_normalize_optional_property_becomes_nullable():
    schema = {
        "type": "object",
        "properties": {
            "batch_index": {
                "type": "integer",
                "description": "Optional batch index.",
            },
        },
        "required": [],
    }

    normalized, _json_keys = normalize_tool_json_schema(schema)

    assert normalized["required"] == ["batch_index"]
    assert normalized["properties"]["batch_index"]["type"] == ["integer", "null"]


def test_coerce_json_string_to_object():
    coerced = coerce_tool_args(
        {"answers": '{"currency":"MXN","cuisine_type":"taqueria"}'},
        frozenset({"answers"}),
    )

    assert coerced["answers"] == {"currency": "MXN", "cuisine_type": "taqueria"}


def test_coerce_keeps_existing_dict():
    original = {"answers": {"currency": "USD"}}
    coerced = coerce_tool_args(original, frozenset({"answers"}))
    assert coerced == original


def test_coerce_strips_null_optional_fields():
    coerced = coerce_tool_args(
        {
            "name": "Wings & Fries",
            "price_cents": None,
            "is_active": True,
            "description": None,
        },
        frozenset(),
    )

    assert coerced == {"name": "Wings & Fries", "is_active": True}
