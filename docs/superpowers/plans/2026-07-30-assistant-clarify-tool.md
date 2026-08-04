# Assistant Clarify Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mid-turn `clarify` tool (Orchestrator + subagents) that blocks the runtime until the user answers via a dedicated endpoint, with SSE UI and configurable timeout (default 288s).

**Architecture:** In-process `ClarifyWaitRegistry` holds an `asyncio.Future` per `(conversation_id, clarify_id)`. The `clarify` FunctionTool emits `agent.clarify`, awaits the Future (with heartbeats), and returns JSON to the LLM. Frontend renders a prompt and POSTs the answer while the chat SSE stays open. The same tool instance is injected into Orchestrator, `catalog_agent`, and `operations_agent`.

**Tech Stack:** Python 3, OpenAI Agents SDK `FunctionTool`, FastAPI, asyncio, Next.js/React chat UI, pytest.

**Spec:** `docs/superpowers/specs/2026-07-30-assistant-clarify-tool-design.es.md`

## Global Constraints

- Tool name: exactly `clarify`
- Params: `question` (required), `choices` (≤4), `multi_select` (bool, default false)
- Setting: `assistant_clarify_timeout_seconds: int = 288`
- One pending clarify per `conversation_id`; a new clarify supersedes the previous with `error=superseded`
- UI always appends “Otro (escribe tu respuesta)” when `choices` is non-null
- Timeout → tool returns `{ok:false, error:"timeout"}`; UI closes; turn may continue
- Owner-facing UI copy in Spanish; agent prompts in English
- Do **not** commit unless the user explicitly asks (project preference overrides frequent-commit defaults)
- Frontend UI work: follow `.cursor/skills/ui-ux-pro-max/SKILL.md` when building the clarify component
- Keep existing menu-import quiz code; do not reuse `menu_import.quiz` as transport

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/core/config.py` | `assistant_clarify_timeout_seconds` |
| `backend/app/core/llm/ports.py` | Add SSE event names `agent.clarify`, `agent.clarify_closed` |
| `backend/app/modules/assistant/agent/workflow/clarify_registry.py` | Wait registry + supersede |
| `backend/app/modules/assistant/agent/workflow/clarify_tool.py` | Validation + FunctionTool builder |
| `backend/app/modules/assistant/agent/workflow/sse.py` | `clarify_event`, `clarify_closed_event` helpers |
| `backend/app/modules/assistant/agent/workflow/agents.py` | `extra_tools` on catalog/operations builders |
| `backend/app/modules/assistant/agent/workflow/delegate.py` | Pass `clarify` into nested subagents |
| `backend/app/modules/assistant/agent/workflow/orchestrator.py` | Build registry + clarify tool; wire to agents |
| `backend/app/modules/assistant/agent/workflow/prompts.py` | When/how to use `clarify` |
| `backend/app/modules/assistant/schemas.py` | Answer request body schema |
| `backend/app/modules/assistant/api.py` | `POST .../clarify/answer` |
| `frontend/src/lib/api/assistant.ts` | Types + stream handlers + answer client |
| `frontend/src/components/assistant/AssistantClarifyPrompt.*` | Clarify UI |
| `frontend/src/components/assistant/AssistantChatPanel.tsx` | Pending state, disable composer |

---

### Task 1: Settings + choice helpers + wait registry

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/modules/assistant/agent/workflow/clarify_registry.py`
- Create: `backend/app/modules/assistant/agent/workflow/clarify_normalize.py` (flatten/validate choices — keep small)
- Test: `backend/tests/modules/test_assistant_clarify_registry.py`
- Test: `backend/tests/modules/test_assistant_clarify_normalize.py`

**Interfaces:**
- Produces: `Settings.assistant_clarify_timeout_seconds: int = 288`
- Produces: `MAX_CLARIFY_CHOICES = 4`
- Produces: `flatten_choice(c: object) -> str`
- Produces: `normalize_clarify_choices(choices: object | None) -> list[str] | None`
- Produces: `class ClarifyWaitRegistry` with:
  - `create(conversation_id: uuid.UUID) -> tuple[uuid.UUID, asyncio.Future[object]]` — supersedes prior pending for that conversation
  - `resolve(conversation_id: uuid.UUID, clarify_id: uuid.UUID, user_response: object) -> None` — raises `KeyError` / domain error if missing
  - `fail(conversation_id: uuid.UUID, clarify_id: uuid.UUID, error: str) -> None`
  - `get_pending(conversation_id: uuid.UUID) -> uuid.UUID | None`

- [ ] **Step 1: Write failing normalize tests**

```python
from app.modules.assistant.agent.workflow.clarify_normalize import (
    flatten_choice,
    normalize_clarify_choices,
)

def test_flatten_dict_label():
    assert flatten_choice({"label": " Efectivo "}) == "Efectivo"

def test_normalize_caps_at_four_and_drops_empty():
    raw = ["a", "b", "c", "d", "e", {"description": ""}]
    assert normalize_clarify_choices(raw) == ["a", "b", "c", "d"]

def test_normalize_empty_becomes_none():
    assert normalize_clarify_choices([]) is None
    assert normalize_clarify_choices(None) is None
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assistant_clarify_normalize.py -q`

- [ ] **Step 3: Implement `clarify_normalize.py`**

```python
MAX_CLARIFY_CHOICES = 4

def flatten_choice(c: object) -> str:
    if c is None:
        return ""
    if isinstance(c, str):
        return c.strip()
    if isinstance(c, dict):
        for key in ("label", "description", "text", "title"):
            v = c.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""
    if isinstance(c, (list, tuple)):
        return " ".join(flatten_choice(x) for x in c).strip()
    return str(c).strip()

def normalize_clarify_choices(choices: object | None) -> list[str] | None:
    if choices is None:
        return None
    if not isinstance(choices, list):
        raise ValueError("choices must be a list of strings")
    cleaned = [s for s in (flatten_choice(c) for c in choices) if s][:MAX_CLARIFY_CHOICES]
    return cleaned or None
```

- [ ] **Step 4: Write failing registry tests**

```python
import asyncio
import uuid
import pytest
from app.modules.assistant.agent.workflow.clarify_registry import ClarifyWaitRegistry

@pytest.mark.asyncio
async def test_resolve_answers_future():
    reg = ClarifyWaitRegistry()
    conv = uuid.uuid4()
    clarify_id, fut = reg.create(conv)
    reg.resolve(conv, clarify_id, "Sí")
    assert await fut == "Sí"

@pytest.mark.asyncio
async def test_supersede_fails_previous():
    reg = ClarifyWaitRegistry()
    conv = uuid.uuid4()
    id1, fut1 = reg.create(conv)
    id2, fut2 = reg.create(conv)
    assert id1 != id2
    with pytest.raises(Exception):
        await fut1  # or assert fut1.exception() / result error payload — match implementation
    assert not fut2.done()
```

Implementation note for supersede: set the previous Future result to a sentinel or call `fail(..., "superseded")` so `clarify` tool maps it to `{ok:false, error:"superseded"}`. Prefer resolving with a structured error object `{"__clarify_error__": "superseded"}` rather than raising into the Future, so `await` always returns.

- [ ] **Step 5: Implement registry + settings field**

Add to `config.py` near other assistant settings:

```python
assistant_clarify_timeout_seconds: int = 288
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assistant_clarify_normalize.py tests/modules/test_assistant_clarify_registry.py -q`

---

### Task 2: SSE events + `clarify` FunctionTool

**Files:**
- Modify: `backend/app/core/llm/ports.py` — extend `ChatStreamEventName`
- Modify: `backend/app/modules/assistant/agent/workflow/sse.py`
- Create: `backend/app/modules/assistant/agent/workflow/clarify_tool.py`
- Test: `backend/tests/modules/test_assistant_clarify_tool.py`

**Interfaces:**
- Consumes: `ClarifyWaitRegistry`, `normalize_clarify_choices`, `Settings.assistant_clarify_timeout_seconds`
- Produces: `CLARIFY_TOOL_NAME = "clarify"`
- Produces: `clarify_event(...)` / `clarify_closed_event(...)` → `ChatStreamEvent`
- Produces: `build_clarify_tool(*, settings, conversation_id, registry, event_sink) -> FunctionTool`
- Event sink type: same as delegate (`Callable[[ChatStreamEvent], Awaitable[None] | None]`)

- [ ] **Step 1: Extend `ChatStreamEventName`**

Add `"agent.clarify"` and `"agent.clarify_closed"` to the Literal in `ports.py`.

- [ ] **Step 2: Add SSE helpers in `sse.py`**

```python
def clarify_event(
    *,
    clarify_id: str,
    conversation_id: str,
    question: str,
    choices: list[str] | None,
    multi_select: bool,
    timeout_seconds: int,
) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.clarify",
        data={
            "clarify_id": clarify_id,
            "conversation_id": conversation_id,
            "question": question,
            "choices": choices,
            "multi_select": multi_select,
            "allow_other": True,
            "timeout_seconds": timeout_seconds,
        },
    )

def clarify_closed_event(
    *,
    clarify_id: str,
    reason: str,  # answered | timeout | superseded | cancelled
) -> ChatStreamEvent:
    return ChatStreamEvent(
        event="agent.clarify_closed",
        data={"clarify_id": clarify_id, "reason": reason},
    )
```

- [ ] **Step 3: Write failing tool tests (validation + timeout with tiny timeout)**

```python
import asyncio, json, uuid
from unittest.mock import MagicMock, AsyncMock
from app.core.config import Settings
from app.modules.assistant.agent.workflow.clarify_registry import ClarifyWaitRegistry
from app.modules.assistant.agent.workflow.clarify_tool import build_clarify_tool

@pytest.mark.asyncio
async def test_clarify_rejects_empty_question():
    tool = build_clarify_tool(
        settings=Settings(assistant_clarify_timeout_seconds=1),
        conversation_id=uuid.uuid4(),
        registry=ClarifyWaitRegistry(),
        event_sink=None,
    )
    raw = await tool.on_invoke_tool(MagicMock(), json.dumps({"question": "  "}))
    payload = json.loads(raw)
    assert payload["ok"] is False

@pytest.mark.asyncio
async def test_clarify_timeout_returns_error():
    events = []
    async def sink(ev):
        events.append(ev)
    tool = build_clarify_tool(
        settings=Settings(assistant_clarify_timeout_seconds=0),  # or 0.01 if int — use monkeypatch / float helper in tool for tests
        conversation_id=uuid.uuid4(),
        registry=ClarifyWaitRegistry(),
        event_sink=sink,
    )
    # Prefer injecting timeout_seconds override in builder for tests, or use 1 and fail immediately via registry fail
```

Prefer: builder accepts optional `timeout_seconds: float | None = None` for tests; production uses settings int.

- [ ] **Step 4: Implement `build_clarify_tool`**

Behavior inside `on_invoke_tool`:

1. Parse JSON args; require non-empty `question`.
2. `choices = normalize_clarify_choices(...)`; `multi_select = bool(...)`.
3. `clarify_id, future = registry.create(conversation_id)`.
4. Emit `agent.status` awaiting_input + `agent.clarify`.
5. Start heartbeat task (every 15s emit `agent.status` awaiting_input) cancelled in `finally`.
6. `try: result = await asyncio.wait_for(future, timeout=timeout)`  
   `except TimeoutError:` emit `clarify_closed(reason=timeout)`; return `{ok:false, error:"timeout", question}`.
7. If result is error sentinel → emit closed (`superseded`); return `{ok:false, error:...}`.
8. Else emit `clarify_closed(reason=answered)`; return success JSON with `user_response` (if multi_select and choices, accept list; else stringify).

Schema description (English) must tell the model: put options only in `choices`, never inside `question`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assistant_clarify_tool.py -q`

---

### Task 3: Wire tool into Orchestrator + subagents + answer API

**Files:**
- Modify: `backend/app/modules/assistant/agent/workflow/agents.py`
- Modify: `backend/app/modules/assistant/agent/workflow/delegate.py`
- Modify: `backend/app/modules/assistant/agent/workflow/orchestrator.py`
- Modify: `backend/app/modules/assistant/agent/workflow/prompts.py`
- Modify: `backend/app/modules/assistant/schemas.py`
- Modify: `backend/app/modules/assistant/api.py`
- Test: `backend/tests/modules/test_assistant_clarify_api.py` (or extend orchestrator tests)
- Test: update `backend/tests/modules/test_operations_agent_tools.py` / catalog builder tests to allow `clarify` in tool lists when passed

**Interfaces:**
- Consumes: `build_clarify_tool`, `ClarifyWaitRegistry`
- Produces: `build_catalog_agent(..., extra_tools: list[FunctionTool] | None = None)`
- Produces: `build_operations_agent(..., extra_tools: list[FunctionTool] | None = None)`
- Produces: `build_delegate_task_tool(..., clarify_tool: FunctionTool | None = None)` — pass into nested builders
- Produces: module-level or app-state accessor for the **same** process registry used by chat streams (singleton on service/orchestrator module)

**Registry lifetime:** Create one `ClarifyWaitRegistry` per process (module singleton) so the answer HTTP handler can resolve Futures created by an in-flight `stream_chat`. Do not create a fresh empty registry only inside the request without sharing it with the API.

```python
# clarify_registry.py
_GLOBAL_REGISTRY = ClarifyWaitRegistry()

def get_clarify_registry() -> ClarifyWaitRegistry:
    return _GLOBAL_REGISTRY
```

- [ ] **Step 1: Extend agent builders**

```python
def build_catalog_agent(..., extra_tools: list[FunctionTool] | None = None):
    tools = build_executor_function_tools(...)
    if extra_tools:
        tools = [*tools, *extra_tools]
    ...
```

Same for `build_operations_agent`.

- [ ] **Step 2: Pass `clarify_tool` through `delegate.py` into `_run_catalog_agent` / `_run_operations_agent`**

Update `build_delegate_task_tool` signature to accept `clarify_tool: FunctionTool | None = None` and pass `extra_tools=[clarify_tool] if clarify_tool else None`.

- [ ] **Step 3: Orchestrator wiring**

In `stream_chat`:

```python
registry = get_clarify_registry()
clarify_tool = build_clarify_tool(
    settings=self._settings,
    conversation_id=resolved_conversation_id,
    registry=registry,
    event_sink=sink,
)
delegate_tool = build_delegate_task_tool(..., clarify_tool=clarify_tool)
orchestrator = build_orchestrator_agent(settings=..., tools=[delegate_tool, clarify_tool])
```

Note: `sink` is defined before tools — keep current pattern (`async def sink` then build tools).

- [ ] **Step 4: Add schemas + API endpoint**

```python
class AssistantClarifyAnswerRequest(BaseModel):
    conversation_id: uuid.UUID
    clarify_id: uuid.UUID
    user_response: str | list[str]
```

```python
@router.post("/restaurants/{restaurant_id}/assistant/clarify/answer")
def answer_assistant_clarify(
    restaurant_id: UUID,
    body: AssistantClarifyAnswerRequest,
    restaurant=Depends(require_owned_restaurant),
):
    try:
        get_clarify_registry().resolve(
            body.conversation_id, body.clarify_id, body.user_response
        )
    except KeyError:
        raise HTTPException(404, "No pending clarify for this id")
    return {"ok": True}
```

Verify ownership: `require_owned_restaurant` already scopes `restaurant_id`; optionally assert conversation belongs to restaurant if a helper exists — if not, document that `clarify_id` secrecy + ownership of restaurant is sufficient for MVP.

- [ ] **Step 5: Prompt updates**

In `ORCHESTRATOR_INSTRUCTIONS`, add a short `# clarify` section (English): use for ambiguity/trade-offs; options only in `choices`; prefer low-stakes defaults; available to subagents too.

Add one line to `CATALOG_AGENT_INSTRUCTIONS` / `OPERATIONS_AGENT_INSTRUCTIONS`: may call `clarify` when the delegated task needs a user decision.

- [ ] **Step 6: Tests**

- API resolve test with registry.create + POST (FastAPI TestClient) or direct registry + tool await race.
- Builder test: `clarify` in orchestrator tools and in catalog/ops when `extra_tools` passed.

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assistant_clarify_tool.py tests/modules/test_assistant_clarify_api.py tests/modules/test_assistant_workflow_orchestrator.py tests/modules/test_operations_agent_tools.py -q`

---

### Task 4: Frontend SSE + answer client + UI

**Files:**
- Modify: `frontend/src/lib/api/assistant.ts`
- Create: `frontend/src/components/assistant/AssistantClarifyPrompt.tsx`
- Create: `frontend/src/components/assistant/AssistantClarifyPrompt.module.css`
- Modify: `frontend/src/components/assistant/AssistantChatPanel.tsx` (or equivalent chat host)
- Optional test: `frontend/src/lib/api/assistantClarify.test.ts` for payload typing helpers
- Skill: read and apply `.cursor/skills/ui-ux-pro-max/SKILL.md` before styling the prompt

**Interfaces:**
- Produces: `AssistantClarifyPayload` type matching SSE `agent.clarify` data
- Produces: `onClarify?: (payload) => void` and `onClarifyClosed?: (payload) => void` on stream handlers
- Produces: `answerAssistantClarify(token, restaurantId, body) => Promise<void>`
- Produces: `<AssistantClarifyPrompt ... onSubmit={...} />`

- [ ] **Step 1: Extend `assistant.ts` stream parser**

On `event: agent.clarify` call `handlers.onClarify?.(data)`.  
On `event: agent.clarify_closed` call `handlers.onClarifyClosed?.(data)`.

Add:

```typescript
export type AssistantClarifyPayload = {
  clarify_id: string;
  conversation_id: string;
  question: string;
  choices: string[] | null;
  multi_select: boolean;
  allow_other: boolean;
  timeout_seconds: number;
};

export async function answerAssistantClarify(
  token: string,
  restaurantId: string,
  body: {
    conversation_id: string;
    clarify_id: string;
    user_response: string | string[];
  },
): Promise<void> { /* POST /restaurants/${id}/assistant/clarify/answer */ }
```

- [ ] **Step 2: Build `AssistantClarifyPrompt`**

Behavior:
- If `choices == null`: single text input + Enviar.
- Else if `!multi_select`: radio list of choices + radio “Otro (escribe tu respuesta)” with text field when selected.
- Else: checkboxes + optional Other text; Enviar enabled when ≥1 selection (or Other text non-empty).
- Submit calls `onSubmit(user_response)`.
- Disabled while submitting.

Match existing chat visual language (reuse spacing/fonts from `MenuImportQuiz` / chat CSS variables where possible; avoid purple-on-white AI cliché per ui-ux-pro-max / user design rules).

- [ ] **Step 3: Wire `AssistantChatPanel`**

State: `pendingClarify: AssistantClarifyPayload | null`.  
On clarify → set pending.  
On clarify_closed → clear if ids match.  
While `pendingClarify`: disable main composer send (keep stream busy UI, but allow clarify interaction).  
On submit → `answerAssistantClarify` → optimistic clear or wait for `clarify_closed`.

- [ ] **Step 4: Manual smoke**

With backend running: force a prompt that causes clarify (or temporary test button / unit-level tool invoke) and confirm SSE stays open, answer unblocks, text continues.

---

### Task 5: Spec status + verification sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-assistant-clarify-tool-design.es.md` — set estado to aprobado/implementado when done

- [ ] **Step 1: Run full relevant backend suite**

```bash
cd backend && .venv/bin/python -m pytest \
  tests/modules/test_assistant_clarify_normalize.py \
  tests/modules/test_assistant_clarify_registry.py \
  tests/modules/test_assistant_clarify_tool.py \
  tests/modules/test_assistant_clarify_api.py \
  tests/modules/test_assistant_workflow_orchestrator.py \
  tests/modules/test_operations_agent_tools.py \
  tests/modules/test_assistant_workflow_context_loader.py -q
```

Expected: all pass (DB tests may skip).

- [ ] **Step 2: Confirm success criteria from spec §10**

1. Clarify visible mid-stream without closing SSE  
2. Answer endpoint unblocks tool  
3. Timeout closes UI and returns error to LLM  
4. Other + multi_select work  

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Mid-turn block + dedicated answer endpoint | 2, 3, 4 |
| Orchestrator + catalog + operations get tool | 3 |
| Timeout default 288 + configurable | 1, 2 |
| Choices ≤4 + flatten + Other in UI | 1, 4 |
| Multi-select | 2, 4 |
| Timeout → error to agent, UI close | 2, 4 |
| One pending / supersede | 1, 2 |
| Heartbeats | 2 |
| SSE `agent.clarify` / closed | 2, 4 |
| Prompts | 3 |
| Tests | 1–3, 5 |
| ui-ux-pro-max on chat UI | 4 |

## Placeholder / consistency self-review

- No TBD left in tasks.
- Names aligned: `clarify`, `ClarifyWaitRegistry`, `assistant_clarify_timeout_seconds`, `agent.clarify`, `agent.clarify_closed`.
- Registry is process singleton so API and stream share waiters.
