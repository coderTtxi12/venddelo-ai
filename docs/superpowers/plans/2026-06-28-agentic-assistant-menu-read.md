# Agentic Assistant Menu Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 2 `menu_read`: the assistant can answer menu questions by running read-only menu tools (`list_categories`, `search_products`, `get_product`) inside the existing Cloud Run SSE request.

**Architecture:** Add a small assistant tools layer (`ToolDefinition`, `ToolResult`, `AgentContext`), a `menu_read` skill backed by existing `MenuService`, and an in-process `AgentOrchestrator` where the **LLM chooses read tools via mandatory JSON responses** (`type: tool_call` or `type: answer`). The system prompt lists all entitled tools for the restaurant. Read-only phase: no mutate tools, no workers, no Cloud Tasks, no Celery.

**Tech Stack:** FastAPI SSE, SQLAlchemy repositories through `SqlAlchemyUnitOfWork`, existing `LLMProviderPort`, existing `MenuService`, pytest.

**Constraints:**
- System prompts and backend-authored templates stay in English.
- User input is usually Spanish; assistant output defaults to Spanish.
- Everything runs in the same backend Cloud Run container and SSE request lifecycle.
- No mutating tools in this plan.
- Do not create commits unless the user explicitly asks; verification replaces the commit step because repo instructions forbid unsolicited commits.

---

## File Structure

- Create `backend/app/modules/assistant/agent/context.py`
  - Defines `AgentContext` with `restaurant_id`, `conversation_id`, `uow`, and `effective_skill_ids`.
- Create `backend/app/modules/assistant/skills/base.py`
  - Defines `ToolEffect`, `ToolDefinition`, `ToolResult`, and `SkillPort`.
- Create `backend/app/modules/assistant/skills/registry.py`
  - Registers skills and filters tools by `effective_skill_ids`.
- Create `backend/app/modules/assistant/skills/menu_read/tools.py`
  - Implements read-only menu tools over `MenuService`.
- Create `backend/app/modules/assistant/skills/menu_read/SKILL.md`
  - English system prompt section for when and how to use menu read tools.
- Create `backend/app/modules/assistant/agent/orchestrator.py`
  - In-process orchestration: detect menu read intent, run read tool(s), stream `tool.start` / `tool.result`, then call `AssistantService.stream_chat()` with tool results included as system/context text.
- Modify `backend/app/modules/assistant/conversation_service.py`
  - Route chat through `AgentOrchestrator` instead of calling `AssistantService` directly.
- Modify `backend/app/core/llm/ports.py`
  - Add `tool.error` to `ChatStreamEventName`.
- Test `backend/tests/modules/test_menu_read_tools.py`
  - Direct tool behavior, tenant scoping, no mutation.
- Test `backend/tests/modules/test_assistant_skill_registry.py`
  - Entitlement filtering and no delete tools.
- Test `backend/tests/api/test_assistant_menu_read_api.py`
  - SSE emits tool events and persists final assistant message.

---

### Task 1: Add Tool Primitives

**Files:**
- Create: `backend/app/modules/assistant/skills/base.py`
- Create: `backend/app/modules/assistant/agent/context.py`
- Test: `backend/tests/modules/test_assistant_skill_registry.py`

- [ ] **Step 1: Write failing tests for tool primitives and no-delete contract**

Add `backend/tests/modules/test_assistant_skill_registry.py`:

```python
import uuid

from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult
from app.modules.assistant.skills.registry import SkillRegistry


class FakeReadSkill(SkillPort):
    id = "fake_read"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="fake_read_tool",
                description="Read something",
                effect="read",
                input_schema={"type": "object", "properties": {}},
            )
        ]

    def execute(self, tool_name: str, args: dict, ctx: AgentContext) -> ToolResult:
        return ToolResult(ok=True, summary="read ok", data={"restaurant_id": str(ctx.restaurant_id)})

    def system_prompt_section(self) -> str:
        return "Use fake read tools only for read-only tasks."


def test_registry_filters_tools_by_effective_skill_ids():
    registry = SkillRegistry([FakeReadSkill()])

    assert registry.tool_definitions(effective_skill_ids=[]) == []
    tools = registry.tool_definitions(effective_skill_ids=["fake_read"])

    assert [tool.name for tool in tools] == ["fake_read_tool"]


def test_registry_rejects_delete_tools():
    class BadSkill(FakeReadSkill):
        id = "bad"

        def tool_definitions(self) -> list[ToolDefinition]:
            return [
                ToolDefinition(
                    name="delete_product",
                    description="Should never be exposed",
                    effect="delete",
                    input_schema={"type": "object", "properties": {}},
                )
            ]

    try:
        SkillRegistry([BadSkill()])
    except ValueError as exc:
        assert "delete" in str(exc)
    else:
        raise AssertionError("delete tool was accepted")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && .venv/bin/pytest tests/modules/test_assistant_skill_registry.py -q --tb=short
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.modules.assistant.skills'`.

- [ ] **Step 3: Implement minimal primitives**

Create `backend/app/modules/assistant/agent/context.py`:

```python
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.db.uow import SqlAlchemyUnitOfWork


@dataclass(frozen=True, slots=True)
class AgentContext:
    restaurant_id: uuid.UUID
    conversation_id: uuid.UUID
    uow: SqlAlchemyUnitOfWork
    effective_skill_ids: list[str]
```

Create `backend/app/modules/assistant/skills/base.py`:

```python
from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.modules.assistant.agent.context import AgentContext

ToolEffect = Literal["read", "mutate"]


class ToolDefinition(BaseModel):
    name: str = Field(min_length=1)
    description: str
    effect: ToolEffect
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    ok: bool
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)


class SkillPort(Protocol):
    id: str

    def tool_definitions(self) -> list[ToolDefinition]: ...

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult: ...

    def system_prompt_section(self) -> str: ...
```

Create `backend/app/modules/assistant/skills/registry.py`:

```python
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import SkillPort, ToolDefinition, ToolResult


class SkillRegistry:
    def __init__(self, skills: Iterable[SkillPort]) -> None:
        self._skills = {skill.id: skill for skill in skills}
        for skill in self._skills.values():
            for tool in skill.tool_definitions():
                if tool.effect == "delete" or tool.name.lower().startswith("delete_"):
                    raise ValueError(f"delete tools are not allowed: {tool.name}")

    def tool_definitions(self, effective_skill_ids: list[str]) -> list[ToolDefinition]:
        effective = set(effective_skill_ids)
        tools: list[ToolDefinition] = []
        for skill_id, skill in self._skills.items():
            if skill_id in effective:
                tools.extend(skill.tool_definitions())
        return tools

    def system_prompt_sections(self, effective_skill_ids: list[str]) -> list[str]:
        effective = set(effective_skill_ids)
        return [
            skill.system_prompt_section()
            for skill_id, skill in self._skills.items()
            if skill_id in effective
        ]

    def execute(
        self,
        skill_id: str,
        tool_name: str,
        args: dict[str, Any],
        ctx: AgentContext,
    ) -> ToolResult:
        if skill_id not in ctx.effective_skill_ids:
            return ToolResult(ok=False, summary="Skill is not enabled for this restaurant")
        skill = self._skills.get(skill_id)
        if skill is None:
            return ToolResult(ok=False, summary="Skill is not registered")
        return skill.execute(tool_name, args, ctx)
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd backend && .venv/bin/pytest tests/modules/test_assistant_skill_registry.py -q
```

Expected: PASS.

---

### Task 2: Implement `menu_read` Tools

**Files:**
- Create: `backend/app/modules/assistant/skills/menu_read/SKILL.md`
- Create: `backend/app/modules/assistant/skills/menu_read/tools.py`
- Test: `backend/tests/modules/test_menu_read_tools.py`

- [ ] **Step 1: Write failing tests for read-only menu tools**

Add `backend/tests/modules/test_menu_read_tools.py`:

```python
import uuid

from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.menu_read.tools import MenuReadSkill
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.conftest import requires_db


@requires_db
def test_menu_read_lists_categories_and_searches_products(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    restaurant = uow.restaurants.add(RestaurantCreate(name="Menu Read", subdomain="menu-read"))
    category = uow.menu.add_category(
        CategoryCreate(restaurant_id=restaurant.id, name="Tacos", sort_index=1)
    )
    product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=restaurant.id,
            name="Taco al pastor",
            description="Con piña",
            price_cents=1200,
            category_ids=[category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=restaurant.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )
    skill = MenuReadSkill()

    categories = skill.execute("list_categories", {}, ctx)
    products = skill.execute("search_products", {"query": "pastor"}, ctx)

    assert categories.ok is True
    assert categories.data["categories"][0]["name"] == "Tacos"
    assert products.ok is True
    assert products.data["products"][0]["id"] == str(product.id)


@requires_db
def test_menu_read_get_product_is_tenant_scoped(session):
    uow = SqlAlchemyUnitOfWork(lambda: session)
    uow.__enter__()
    owned = uow.restaurants.add(RestaurantCreate(name="Owned", subdomain="owned-read"))
    other = uow.restaurants.add(RestaurantCreate(name="Other", subdomain="other-read"))
    owned_category = uow.menu.add_category(
        CategoryCreate(restaurant_id=owned.id, name="Owned category")
    )
    other_category = uow.menu.add_category(
        CategoryCreate(restaurant_id=other.id, name="Other category")
    )
    other_product = uow.menu.add_product(
        ProductCreate(
            restaurant_id=other.id,
            name="Other taco",
            price_cents=1000,
            category_ids=[other_category.id],
        )
    )
    ctx = AgentContext(
        restaurant_id=owned.id,
        conversation_id=uuid.uuid4(),
        uow=uow,
        effective_skill_ids=["menu_read"],
    )

    result = MenuReadSkill().execute("get_product", {"product_id": str(other_product.id)}, ctx)

    assert result.ok is False
    assert "not found" in result.summary.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && .venv/bin/pytest tests/modules/test_menu_read_tools.py -q --tb=short
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.modules.assistant.skills.menu_read'`.

- [ ] **Step 3: Implement menu read skill**

Create `backend/app/modules/assistant/skills/menu_read/SKILL.md`:

```markdown
# Menu Read Skill

Use this skill for read-only questions about the restaurant menu.

Rules:
- Use only tenant-scoped data from the current restaurant.
- Do not mutate menu data.
- Do not invent prices, availability, categories, or add-ons.
- User prompts are usually Spanish. Final answers should be Spanish unless the user asks otherwise.
```

Create `backend/app/modules/assistant/skills/menu_read/tools.py`:

```python
from __future__ import annotations

import uuid
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.pagination import PaginationParams
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.skills.base import ToolDefinition, ToolResult
from app.modules.menu.service import MenuService


def _product_payload(product) -> dict[str, Any]:
    return {
        "id": str(product.id),
        "name": product.name,
        "description": product.description,
        "price_cents": product.price_cents,
        "currency": product.currency,
        "is_active": product.is_active,
        "is_published": product.is_published,
        "approval_status": product.approval_status,
        "category_ids": [str(item) for item in product.category_ids],
        "option_groups": [
            {
                "id": str(group.id),
                "title": group.title,
                "required": group.required,
                "selection": group.selection,
                "items": [
                    {
                        "id": str(item.id),
                        "label": item.label,
                        "price_delta_cents": item.price_delta_cents,
                        "is_active": item.is_active,
                    }
                    for item in group.items
                ],
            }
            for group in product.option_groups
        ],
    }


class MenuReadSkill:
    id = "menu_read"

    def tool_definitions(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="list_categories",
                description="List active menu categories for the current restaurant.",
                effect="read",
                input_schema={"type": "object", "properties": {}},
            ),
            ToolDefinition(
                name="search_products",
                description="Search products by name or description in the current restaurant.",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
            ToolDefinition(
                name="get_product",
                description="Get one product by id in the current restaurant.",
                effect="read",
                input_schema={
                    "type": "object",
                    "properties": {"product_id": {"type": "string"}},
                    "required": ["product_id"],
                },
            ),
        ]

    def execute(self, tool_name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        service = MenuService(ctx.uow.menu)
        if tool_name == "list_categories":
            page = service.list_categories(ctx.restaurant_id, PaginationParams(limit=100))
            categories = [
                {
                    "id": str(category.id),
                    "name": category.name,
                    "description": category.description,
                    "sort_index": category.sort_index,
                    "is_active": category.is_active,
                }
                for category in page.items
                if category.is_active
            ]
            return ToolResult(
                ok=True,
                summary=f"Found {len(categories)} active categories",
                data={"categories": categories},
            )

        if tool_name == "search_products":
            query = str(args.get("query", "")).strip().casefold()
            page = service.list_products(ctx.restaurant_id, PaginationParams(limit=200))
            products = []
            for product in page.items:
                haystack = f"{product.name} {product.description or ''}".casefold()
                if product.is_active and (not query or query in haystack):
                    products.append(_product_payload(product))
            return ToolResult(
                ok=True,
                summary=f"Found {len(products)} matching products",
                data={"products": products[:20]},
            )

        if tool_name == "get_product":
            try:
                product_id = uuid.UUID(str(args.get("product_id")))
                product = service.get_product(ctx.restaurant_id, product_id)
            except (ValueError, NotFoundError):
                return ToolResult(ok=False, summary="Product not found")
            return ToolResult(ok=True, summary=f"Found product {product.name}", data={"product": _product_payload(product)})

        return ToolResult(ok=False, summary=f"Unknown tool: {tool_name}")

    def system_prompt_section(self) -> str:
        return (
            "Menu Read Skill: use read-only tools to answer questions about categories, "
            "products, prices, availability, and add-ons. Never mutate data."
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend && .venv/bin/pytest tests/modules/test_menu_read_tools.py -q
```

Expected: PASS.

---

### Task 3: Add In-Process Agent Orchestrator for Menu Read

**Files:**
- Create: `backend/app/modules/assistant/agent/orchestrator.py`
- Modify: `backend/app/core/llm/ports.py`
- Test: `backend/tests/modules/test_agent_orchestrator.py`

- [ ] **Step 1: Write failing orchestrator tests**

Add `backend/tests/modules/test_agent_orchestrator.py`:

```python
import uuid

from app.core.llm.ports import ChatStreamEvent
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.orchestrator import AgentOrchestrator
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from datetime import UTC, datetime


def _profile() -> AssistantProfileRecord:
    now = datetime.now(UTC)
    return AssistantProfileRecord(
        restaurant_id=uuid.uuid4(),
        display_name="Luna",
        identity_markdown="# IDENTITY",
        behavior_markdown="# BEHAVIOR",
        menu_markdown="# MENU",
        enabled_skill_ids=["menu_read"],
        version=1,
        created_at=now,
        updated_at=now,
    )


def test_orchestrator_passthrough_when_menu_read_not_enabled():
    class EmptyRegistry:
        def tool_definitions(self, effective_skill_ids): return []
        def system_prompt_sections(self, effective_skill_ids): return []

    orchestrator = AgentOrchestrator(provider=StubLLMProvider(), registry=EmptyRegistry())
    ctx = AgentContext(
        restaurant_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        uow=None,  # type: ignore[arg-type]
        effective_skill_ids=[],
    )

    events = list(orchestrator.stream_chat(AssistantChatRequest(message="Hola"), profile=_profile(), ctx=ctx))

    assert any(event.event == "message.complete" for event in events)
    assert not any(event.event == "tool.start" for event in events)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && .venv/bin/pytest tests/modules/test_agent_orchestrator.py -q --tb=short
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.modules.assistant.agent.orchestrator'`.

- [ ] **Step 3: Add `tool.error` event type**

Modify `backend/app/core/llm/ports.py`:

```python
ChatStreamEventName = Literal[
    "content.delta",
    "message.complete",
    "error",
    "agent.phase",
    "agent.status",
    "tool.start",
    "tool.result",
    "tool.error",
]
```

- [ ] **Step 4: Implement orchestrator passthrough and hook points**

Create `backend/app/modules/assistant/agent/orchestrator.py`:

```python
from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from app.core.llm.ports import ChatStreamEvent, LLMProviderPort
from app.modules.assistant.agent.context import AgentContext
from app.modules.assistant.agent.prompt_composer import compose_system_prompt
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.schemas import AssistantChatRequest
from app.modules.assistant.service import AssistantService
from app.modules.assistant.skills.registry import SkillRegistry


class AgentOrchestrator:
    def __init__(self, *, provider: LLMProviderPort, registry: SkillRegistry) -> None:
        self._assistant = AssistantService(provider=provider)
        self._registry = registry

    def stream_chat(
        self,
        request: AssistantChatRequest,
        *,
        profile: AssistantProfileRecord,
        ctx: AgentContext,
        message_id: str | None = None,
    ) -> Iterator[ChatStreamEvent]:
        system_prompt = compose_system_prompt(profile, effective_skill_ids=ctx.effective_skill_ids)
        sections = self._registry.system_prompt_sections(ctx.effective_skill_ids)
        if sections:
            system_prompt = system_prompt + "\n\n---\n\n" + "\n\n".join(sections)

        yield ChatStreamEvent(event="agent.phase", data={"phase": "analyzing"})

        # The actual menu_read tool routing is added in Task 4.
        yield from self._assistant.stream_chat(
            request,
            message_id=message_id,
            restaurant_id=str(ctx.restaurant_id),
            conversation_id=str(ctx.conversation_id),
            system_prompt=system_prompt,
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd backend && .venv/bin/pytest tests/modules/test_agent_orchestrator.py -q
```

Expected: PASS.

---

### Task 4: Route Menu Read Intents Through Tools

**Files:**
- Modify: `backend/app/modules/assistant/agent/orchestrator.py`
- Test: `backend/tests/api/test_assistant_menu_read_api.py`

- [ ] **Step 1: Write failing API test for tool events**

Add `backend/tests/api/test_assistant_menu_read_api.py`:

```python
from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.infra.llm.stub_provider import StubLLMProvider
from app.modules.menu.schemas import CategoryCreate, ProductCreate
from app.modules.restaurants.schemas import RestaurantCreate
from tests.api.conftest import OWNER
from tests.api.test_assistant_conversations_api import _parse_sse
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_menu_read_chat_emits_tool_events(client, engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        restaurant = uow.restaurants.add(
            RestaurantCreate(name="Assistant Menu Read", subdomain="assistant-menu-read"),
            owner_id=OWNER,
        )
        category = uow.menu.add_category(
            CategoryCreate(restaurant_id=restaurant.id, name="Tacos")
        )
        uow.menu.add_product(
            ProductCreate(
                restaurant_id=restaurant.id,
                name="Taco al pastor",
                description="Con piña",
                price_cents=1200,
                category_ids=[category.id],
            )
        )
        uow.commit()

    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    ).json()
    updated = client.patch(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
        json={"display_name": "Luna", "expected_version": profile["version"]},
    ).json()
    conversation = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    ).json()

    with patch("app.modules.assistant.api.build_llm_provider", return_value=StubLLMProvider()):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/conversations/{conversation['id']}/chat",
            headers={**AUTH, "Accept": "text/event-stream"},
            json={
                "message": "Busca productos pastor en mi menú",
                "profile_version": updated["version"],
            },
        )

    assert response.status_code == 200
    events = _parse_sse(response.text)
    names = [name for name, _ in events]
    assert "tool.start" in names
    assert "tool.result" in names
    assert events[-1][0] == "message.complete"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && .venv/bin/pytest tests/api/test_assistant_menu_read_api.py -q --tb=short
```

Expected: FAIL because `tool.start` is not emitted yet.

- [ ] **Step 3: Implement LLM JSON tool selection in orchestrator**

Modify `backend/app/modules/assistant/agent/orchestrator.py`:

- Append `build_tools_prompt_section(entitled_tools)` to the system prompt.
- Call the LLM and parse a mandatory JSON response (`tool_call` or `answer`).
- On `tool_call`, execute the entitled tool, append the result, and call the LLM again until `answer`.
- Stream `answer.content` to the client via SSE.

Do **not** add keyword/heuristic routing in backend code.

- [ ] **Step 4: Run API test to verify it passes**

Run:

```bash
cd backend && .venv/bin/pytest tests/api/test_assistant_menu_read_api.py -q
```

Expected: PASS.

---

### Task 5: Wire Orchestrator Into Conversation Service

**Files:**
- Modify: `backend/app/modules/assistant/conversation_service.py`
- Modify: `backend/app/modules/assistant/api.py`
- Test: `backend/tests/api/test_assistant_conversations_api.py`
- Test: `backend/tests/api/test_assistant_menu_read_api.py`

- [ ] **Step 1: Write failing integration assertion**

Extend `backend/tests/api/test_assistant_conversations_api.py::test_stream_persists_messages`:

```python
    events = _parse_sse(response.text)
    assert "agent.phase" in [name for name, _ in events]
```

Run:

```bash
cd backend && .venv/bin/pytest tests/api/test_assistant_conversations_api.py::test_stream_persists_messages -q --tb=short
```

Expected: if the orchestrator is not wired yet, this fails because the old direct assistant path is used.

- [ ] **Step 2: Wire default registry and orchestrator**

In `backend/app/modules/assistant/api.py`, create a helper:

```python
from app.modules.assistant.skills.menu_read.tools import MenuReadSkill
from app.modules.assistant.skills.registry import SkillRegistry


def _assistant_skill_registry() -> SkillRegistry:
    return SkillRegistry([MenuReadSkill()])
```

In `AssistantConversationService.__init__`, accept `registry: SkillRegistry`.

Replace the direct `self._assistant.stream_chat(...)` call with:

```python
ctx = AgentContext(
    restaurant_id=restaurant_id,
    conversation_id=conversation_id,
    uow=self._uow,
    effective_skill_ids=effective_skills,
)
orchestrator = AgentOrchestrator(provider=self._provider, registry=self._registry)
for event in orchestrator.stream_chat(
    request,
    profile=profile_record,
    ctx=ctx,
    message_id=str(assistant_message_id),
):
    ...
```

Implementation note: if `AssistantConversationService` currently receives only repositories, change its constructor to receive the whole `SqlAlchemyUnitOfWork` or explicitly receive `menu_repo` plus assistant repo. Prefer whole `uow` because `AgentContext` needs tenant-scoped service access for future skills.

- [ ] **Step 3: Run integration tests**

Run:

```bash
cd backend && .venv/bin/pytest tests/api/test_assistant_conversations_api.py tests/api/test_assistant_menu_read_api.py -q
```

Expected: PASS.

---

### Task 6: Final Verification

**Files:**
- All files from previous tasks.

- [ ] **Step 1: Run focused assistant tests**

Run:

```bash
cd backend && .venv/bin/pytest \
  tests/modules/test_assistant_profile.py \
  tests/modules/test_prompt_composer.py \
  tests/modules/test_assistant_skill_registry.py \
  tests/modules/test_menu_read_tools.py \
  tests/modules/test_agent_orchestrator.py \
  tests/api/test_assistant_profile_api.py \
  tests/api/test_assistant_conversations_api.py \
  tests/api/test_assistant_menu_read_api.py \
  -q --tb=short
```

Expected: PASS.

- [ ] **Step 2: Run lint on changed files**

Run:

```bash
cd backend && .venv/bin/ruff check app/modules/assistant tests/modules/test_assistant_skill_registry.py tests/modules/test_menu_read_tools.py tests/modules/test_agent_orchestrator.py tests/api/test_assistant_menu_read_api.py
```

Expected: PASS.

- [ ] **Step 3: Manual SSE smoke test**

With backend running locally and an assistant profile named:

```bash
curl -N \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"message":"Busca productos pastor en mi menú","profile_version":2}' \
  "$API_URL/api/v1/restaurants/$RID/assistant/conversations/$CID/chat"
```

Expected stream includes:

```text
event: agent.phase
event: tool.start
event: tool.result
event: content.delta
event: message.complete
```

---

## Self-Review

**Spec coverage:**
- `menu_read` skill from §6.2 is implemented.
- Tool registry filters by `effective_skill_ids` from §6.4.
- Tool executor rejects non-entitled skills.
- Agent loop emits `tool.start` / `tool.result` from §7.5.
- Tenant isolation uses `restaurant_id` from `AgentContext`.
- No-delete contract is tested.
- Cloud Run constraint is respected: no worker, no queue, no background process.

**Known non-goals for this plan:**
- No mutating tools.
- No confirmation token flow.
- No native OpenAI tool-calling API (JSON contract in prompt instead).
- No backend keyword/heuristic tool routing.

**Placeholder scan:** no placeholders; all tasks include exact file paths, commands, and expected results.

**Type consistency:** `AgentContext`, `ToolDefinition`, `ToolResult`, `SkillRegistry`, and `MenuReadSkill` names are consistent across tasks.

