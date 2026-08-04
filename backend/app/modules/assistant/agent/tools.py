"""Bridge Venddelo skill tools to OpenAI Agents SDK ``FunctionTool`` instances."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Collection
from typing import Any

from agents import FunctionTool, RunContextWrapper

from app.core.config import Settings
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tool_schema import coerce_tool_args, normalize_tool_json_schema
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.context import AgentContext
from app.modules.assistant.skills.registry import SkillRegistry

# Business-ops tools owned by operations_agent (excluded from catalog_agent).
OPERATIONS_AGENT_TOOL_NAMES = frozenset(
    {
        "get_restaurant_name",
        "get_restaurant_description",
        "update_restaurant_description",
        "get_restaurant_location",
        "update_restaurant_location",
        "get_restaurant_schedules",
        "set_restaurant_schedules",
        "get_delivery_provider_schedules",
        "get_restaurant_payment_methods",
        "set_restaurant_payment_methods",
        "get_delivery_provider_payment_methods",
        "get_restaurant_menu_qr",
        "get_restaurant_public_menu_url",
        "assign_restaurant_logo",
        "remove_restaurant_logo",
        "assign_restaurant_cover",
        "remove_restaurant_cover",
    }
)

def _encode_tool_result(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def _execute_tool_isolated(
    registry: SkillRegistry,
    skill_id: str,
    tool_name: str,
    parsed_args: dict[str, Any],
    agent_ctx: AgentContext,
) -> ToolResult:
    """Run a sync tool on its own DB session so the event loop stays responsive."""
    uow = SqlAlchemyUnitOfWork()
    uow.__enter__()
    try:
        isolated_ctx = AgentContext(
            restaurant_id=agent_ctx.restaurant_id,
            conversation_id=agent_ctx.conversation_id,
            uow=uow,
            effective_skill_ids=list(agent_ctx.effective_skill_ids),
        )
        result = registry.execute(skill_id, tool_name, parsed_args, isolated_ctx)
        uow.commit()
        return result
    except Exception:
        uow.rollback()
        raise
    finally:
        uow.__exit__(None, None, None)


def build_skill_function_tools(skill: SkillPort) -> list[FunctionTool]:
    """Wrap one skill executor as OpenAI Agents SDK function tools."""
    registry = SkillRegistry([skill])
    return build_registry_function_tools(registry, [skill.id])


def build_registry_function_tools(
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    *,
    expose_menu_import_granular: bool = True,
    include_tool_names: Collection[str] | None = None,
    exclude_tool_names: Collection[str] | None = None,
) -> list[FunctionTool]:
    """Wrap entitled registry tools for the executor agent."""
    tools: list[FunctionTool] = []
    seen: set[str] = set()
    hide_menu_import = (
        "menu_import" in effective_skill_ids and not expose_menu_import_granular
    )
    include = frozenset(include_tool_names) if include_tool_names is not None else None
    exclude = frozenset(exclude_tool_names) if exclude_tool_names else frozenset()
    for skill_id, tool_def in registry.entitled_tools(effective_skill_ids):
        if hide_menu_import and skill_id == "menu_import":
            continue
        if include is not None and tool_def.name not in include:
            continue
        if tool_def.name in exclude:
            continue
        if tool_def.name in seen:
            continue
        seen.add(tool_def.name)
        tools.append(_build_registry_tool(registry, skill_id, tool_def))
    return tools


def build_menu_import_internal_tools(registry: SkillRegistry) -> list[FunctionTool]:
    """All granular menu_import tools for the dedicated import agent."""
    return build_registry_function_tools(
        registry,
        ["menu_import"],
        expose_menu_import_granular=True,
    )


def build_executor_function_tools(
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    *,
    settings: Settings | None = None,
) -> list[FunctionTool]:
    """Catalog-agent tools from entitled skills (ops tools go to operations_agent)."""
    del settings
    entitled = [skill_id for skill_id in effective_skill_ids if skill_id != "menu_import"]
    return build_registry_function_tools(
        registry,
        entitled,
        expose_menu_import_granular=False,
        exclude_tool_names=OPERATIONS_AGENT_TOOL_NAMES,
    )


def build_operations_function_tools(
    registry: SkillRegistry,
    effective_skill_ids: list[str],
    *,
    settings: Settings | None = None,
) -> list[FunctionTool]:
    """Business-ops tools for operations_agent only."""
    del settings
    entitled = [skill_id for skill_id in effective_skill_ids if skill_id != "menu_import"]
    return build_registry_function_tools(
        registry,
        entitled,
        expose_menu_import_granular=False,
        include_tool_names=OPERATIONS_AGENT_TOOL_NAMES,
    )


def _build_registry_tool(
    registry: SkillRegistry,
    skill_id: str,
    tool_def: ToolDefinition,
) -> FunctionTool:
    tool_name = tool_def.name

    async def on_invoke_tool(
        ctx: RunContextWrapper[AssistantRunContext],
        args: str,
    ) -> str:
        parsed_args = json.loads(args) if args else {}
        if not isinstance(parsed_args, dict):
            parsed_args = {}
        parsed_args = coerce_tool_args(parsed_args, json_string_keys)

        run_ctx = ctx.context
        resolved = run_ctx.registry.resolve_tool(tool_name, run_ctx.agent_ctx.effective_skill_ids)
        if resolved is None:
            return _encode_tool_result({"ok": False, "summary": f"Tool not enabled: {tool_name!r}"})
        resolved_skill_id, _ = resolved
        if resolved_skill_id != skill_id:
            return _encode_tool_result(
                {"ok": False, "summary": f"Skill mismatch for {tool_name!r}: expected {skill_id!r}"}
            )

        result = await asyncio.to_thread(
            _execute_tool_isolated,
            run_ctx.registry,
            skill_id,
            tool_name,
            parsed_args,
            run_ctx.agent_ctx,
        )
        return _encode_tool_result(
            {
                "ok": result.ok,
                "summary": result.summary,
                "data": result.data,
            }
        )

    params_schema, json_string_keys = normalize_tool_json_schema(
        tool_def.input_schema or {"type": "object", "properties": {}}
    )

    description = tool_def.description
    if tool_def.effect in ("mutate", "delete"):
        description = f"[{tool_def.effect.upper()}] {description}"

    return FunctionTool(
        name=tool_name,
        description=description,
        params_json_schema=params_schema,
        on_invoke_tool=on_invoke_tool,
    )
