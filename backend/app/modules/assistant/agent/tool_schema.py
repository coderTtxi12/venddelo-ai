"""Normalize skill tool JSON schemas for OpenAI strict function calling."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any


def normalize_tool_json_schema(schema: dict[str, Any]) -> tuple[dict[str, Any], frozenset[str]]:
    """Return a strict-compatible schema and root keys that accept JSON object strings."""
    json_string_keys: set[str] = set()
    original_required = set(schema.get("required") or [])
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        properties = {}

    normalized_properties: dict[str, Any] = {}
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            prop = {}
        optional = name not in original_required
        normalized_properties[name] = _normalize_property(
            name,
            prop,
            optional=optional,
            json_string_keys=json_string_keys,
        )

    normalized = {
        "type": "object",
        "properties": normalized_properties,
        "required": list(normalized_properties.keys()),
        "additionalProperties": False,
    }
    return normalized, frozenset(json_string_keys)


def coerce_tool_args(args: dict[str, Any], json_string_keys: frozenset[str]) -> dict[str, Any]:
    """Parse JSON object strings back into dicts for tool execution."""
    coerced = _strip_null_args(args)
    if not coerced or not json_string_keys:
        return coerced

    for key in json_string_keys:
        value = coerced.get(key)
        if isinstance(value, dict):
            continue
        if value is None:
            continue
        if not isinstance(value, str):
            continue
        stripped = value.strip()
        if not stripped:
            coerced[key] = {}
            continue
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            coerced[key] = parsed
    return coerced


def _strip_null_args(value: Any) -> Any:
    """Drop null leaves produced by strict function-calling schemas."""
    if isinstance(value, dict):
        return {
            key: _strip_null_args(item)
            for key, item in value.items()
            if item is not None
        }
    if isinstance(value, list):
        return [_strip_null_args(item) for item in value]
    return value


def _normalize_property(
    name: str,
    prop: dict[str, Any],
    *,
    optional: bool,
    json_string_keys: set[str],
) -> dict[str, Any]:
    prop_type = prop.get("type")

    if prop_type == "object":
        nested = prop.get("properties")
        if not isinstance(nested, dict) or not nested:
            json_string_keys.add(name)
            description = str(prop.get("description") or "").strip()
            suffix = "Provide as a JSON object string."
            return {
                "type": "string",
                "description": f"{description} {suffix}".strip() if description else suffix,
            }

        normalized_nested = {
            child_name: _normalize_property(
                child_name,
                child_prop if isinstance(child_prop, dict) else {},
                optional=child_name not in set(prop.get("required") or []),
                json_string_keys=json_string_keys,
            )
            for child_name, child_prop in nested.items()
        }
        normalized: dict[str, Any] = {
            "type": "object",
            "properties": normalized_nested,
            "required": list(normalized_nested.keys()),
            "additionalProperties": False,
        }
        if prop.get("description"):
            normalized["description"] = prop["description"]
        return _apply_optional(normalized, optional)

    if prop_type == "array":
        normalized = deepcopy(prop)
        items = normalized.get("items")
        if isinstance(items, dict):
            normalized["items"] = _normalize_property(
                f"{name}[]",
                items,
                optional=False,
                json_string_keys=json_string_keys,
            )
        return _apply_optional(normalized, optional)

    return _apply_optional(deepcopy(prop), optional)


def _apply_optional(prop: dict[str, Any], optional: bool) -> dict[str, Any]:
    if not optional:
        return prop

    prop_type = prop.get("type")
    if prop_type is None:
        return prop
    if isinstance(prop_type, list):
        if "null" in prop_type:
            return prop
        return {**prop, "type": [*prop_type, "null"]}
    return {**prop, "type": [prop_type, "null"]}
