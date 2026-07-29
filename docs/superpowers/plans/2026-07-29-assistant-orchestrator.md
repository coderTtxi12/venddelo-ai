# Assistant Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Router → Executor → Evaluator → Responder with an Orchestrator agent that has one tool `delegate_task` to `restaurant_ops_subagent` | `menu_subagent`, and replies directly to the owner.

**Architecture:** One OpenAI Agents SDK Agent (`Orchestrator`) streams free-text to the user. Its only tool runs a nested `Runner` for the chosen subagent and returns `ExecutionRecord` JSON. Python emits `menu_import.quiz` from the session DB. No Evaluator retries loop; re-delegation is via another `delegate_task` call (max 3).

**Tech Stack:** Python, OpenAI Agents SDK (`Agent`, `Runner`, `FunctionTool`), Pydantic, existing SSE chat stream, pytest.

**Spec:** `docs/superpowers/specs/2026-07-29-assistant-orchestrator-design.es.md`

## Global Constraints

- Subagent enum values: exactly `restaurant_ops_subagent` | `menu_subagent`
- Tool name: exactly `delegate_task` with args `subagent`, `task`
- `ORCHESTRATOR_MAX_TURNS = 8`, `MAX_DELEGATIONS_PER_TURN = 3`
- System prompts in English; owner-facing replies in Spanish
- Keep `ExecutionRecord`; remove chat-path use of `WorkflowRouteDecision` / `WorkflowEvaluation`
- Remove workflow Responder, Evaluator, Router, and MenuImportResponder
- Quiz SSE still from session/DB after import delegation
- Append `public_menu_url` to menu_subagent tool result when `should_inject_public_menu_url_for_responder` applies
- Only Orchestrator emits `content.delta`; subagents use `include_text_deltas=False`
- Commit frequently per task; do not push

## File map

| File | Responsibility |
|------|----------------|
| `agent/workflow/schemas.py` | Keep `ExecutionRecord`; remove or stop exporting route/eval from chat path |
| `agent/workflow/prompts.py` | `ORCHESTRATOR_INSTRUCTIONS`, ops + menu subagent prompts |
| `agent/workflow/agents.py` | `build_orchestrator_agent`, `build_restaurant_ops_subagent`, drop router/eval/responder |
| `agent/workflow/delegate.py` (new) | Build `delegate_task` FunctionTool + run subagents |
| `agent/workflow/context_loader.py` | `orchestrator_input`, subagent inputs without route; drop responder/evaluator inputs |
| `agent/workflow/orchestrator.py` | Single Orchestrator stream loop + quiz/persist |
| `agent/workflow/sse.py` / `stream_mapping.py` | Phase `orchestrating`; drop router reason parser usage |
| `skills/menu_import/onboarding_agent.py` | `menu_subagent` only |
| `skills/menu_import/prompts.py` | Drop responder instructions; retarget executor → orchestrator |
| Tests under `backend/tests/modules/test_assistant_workflow_*.py` | Match new flow |

---

### Task 1: Schemas + prompts + agent builders

**Files:**
- Modify: `backend/app/modules/assistant/agent/workflow/schemas.py`
- Modify: `backend/app/modules/assistant/agent/workflow/prompts.py`
- Modify: `backend/app/modules/assistant/agent/workflow/agents.py`
- Modify: `backend/app/modules/assistant/skills/menu_import/onboarding_agent.py`
- Modify: `backend/app/modules/assistant/skills/menu_import/prompts.py`
- Test: `backend/tests/modules/test_assistant_workflow_schemas.py` (trim route/eval tests if removed)
- Test: add assertions in existing agent/prompt tests or a small new unit test for builders

**Interfaces:**
- Produces: `build_orchestrator_agent(*, settings, tools) -> Agent`
- Produces: `build_restaurant_ops_subagent(*, settings, registry, effective_skill_ids) -> Agent` (name `RestaurantOpsSubagent`)
- Produces: `build_menu_subagent(*, settings, registry) -> Agent` (name `MenuSubagent`)
- Produces: `ORCHESTRATOR_INSTRUCTIONS`, `RESTAURANT_OPS_SUBAGENT_INSTRUCTIONS`, `MENU_SUBAGENT_INSTRUCTIONS`
- Removes: `build_router_agent`, `build_evaluator_agent`, `build_responder_agent`, `build_menu_import_responder_agent`, `build_executor_agent` (alias ok during transition then delete)

- [ ] **Step 1:** Rewrite `prompts.py` with Orchestrator + two subagent instruction strings (migrate Responder owner-facing rules into Orchestrator; strip Responder/Evaluator refs from ops/menu prompts).

- [ ] **Step 2:** Update `agents.py` factories; rename menu onboarding builder to `build_menu_subagent` / `MENU_SUBAGENT_NAME = "MenuSubagent"`; delete MenuImportResponder builder.

- [ ] **Step 3:** In `schemas.py`, keep `ExecutionRecord` helpers needed for approval clear; remove `WorkflowRouteDecision` / `WorkflowEvaluation` / `adjust_evaluation_for_execution` if nothing else imports them after Task 3–4 (or leave until cleanup task and delete then).

- [ ] **Step 4:** Run focused tests that still pass / update schema tests.

- [ ] **Step 5:** Commit `feat(assistant): add orchestrator and subagent builders`

---

### Task 2: `delegate_task` tool

**Files:**
- Create: `backend/app/modules/assistant/agent/workflow/delegate.py`
- Test: `backend/tests/modules/test_assistant_workflow_delegate.py`

**Interfaces:**
- Consumes: builders from Task 1, `ExecutionRecord`, `clear_execution_approval_gates`
- Produces: `build_delegate_task_tool(*, settings, workflow_context, registries, uow, restaurant_id, event_sink, delegation_counter) -> FunctionTool`
- Tool JSON schema:
  ```json
  {
    "type": "object",
    "properties": {
      "subagent": {"type": "string", "enum": ["restaurant_ops_subagent", "menu_subagent"]},
      "task": {"type": "string", "minLength": 1}
    },
    "required": ["subagent", "task"],
    "additionalProperties": false
  }
  ```
- On invoke: validate enum; enforce `MAX_DELEGATIONS_PER_TURN`; run nested `Runner.run_streamed` (or `run`) for subagent with `task` as goal; return `ExecutionRecord.model_dump_json()`; for menu, optionally append `public_menu_url` field in a wrapper JSON `{"execution": {...}, "public_menu_url": "..."}` when injectable.
- `event_sink`: async-capable queue or callback list so orchestrator can forward tool SSE events (design: collect mapped events onto a shared `list` / `asyncio.Queue` the outer stream drains — prefer a mutable `list[ChatStreamEvent]` filled during invoke, drained by outer loop between stream events; if SDK blocks until tool returns, emit phase+tool events only inside the tool via a callback passed into mapping).

**Practical event bridging:** Because `on_invoke_tool` runs inside the Orchestrator stream, push mapped subagent events into an `asyncio.Queue` that the outer `stream_chat` also iterates (or yield phase_event inside tool is impossible). Preferred pattern in this codebase: while nested `run_streamed` runs inside the tool, append to `side_events: list[ChatStreamEvent]`; the orchestrator’s outer loop cannot interleave mid-tool. Accept that tool SSE for subagents arrives as a burst when the tool completes **or** use a queue polled by a concurrent task. **Chosen approach:** run nested stream inside the tool, append events to `side_events`, and have outer mapper also not need mid-tool interleave for v1 — emit `phase_event("executing")` at tool start via appending to `side_events`, and after Orchestrator stream finishes each tool call… Actually Agents SDK awaits tool completion before continuing, so UI will see a pause then a burst. To preserve today’s UX, use `asyncio.Queue` + background task consuming nested stream while tool awaits completion, and have outer `stream_chat` `asyncio.wait` on both Orchestrator stream and queue. Keep it simpler for v1: **nested stream inside tool; collect tool.start/end into side_events; outer loop flushes `side_events` after each Orchestrator stream event and again after run completes.** Flushing after each outer event won’t help during tool. **Better v1:** don’t nest stream in tool for SSE fidelity — instead handle delegation in Python outside the model… Spec requires tool. **Implement:** `on_invoke_tool` runs nested `Runner.run_streamed`, for each mapped event `await event_queue.put(event)`, and outer loop uses `asyncio.create_task` pattern OR the orchestrator does not use Agent tools for streaming and… Stick to spec.

**Chosen SSE bridge:** `event_queue: asyncio.Queue[ChatStreamEvent | None]`. Outer loop:

```python
stream_task = asyncio.create_task(consume_orchestrator_stream(...))
while True:
    queue_get = asyncio.create_task(event_queue.get())
    done, _ = await asyncio.wait({stream_task, queue_get}, return_when=FIRST_COMPLETED)
    ...
```

Too heavy. **Simpler chosen approach matching existing tests:** tests mock `Runner.run_streamed` at module level; nested calls also hit the mock. For production, nested stream inside tool yields mapped events into `side_events` list; document that SSE tool events appear when subagent finishes (acceptable for this step). Emit one `phase_event("executing")` with label at start of tool via putting into side_events — outer flush won’t see until tool returns. **Final:** return execution JSON from tool; outer orchestrator already gets `tool.start`/`tool.end` for `delegate_task` itself from the Orchestrator stream mapping — that is enough for v1. Subagent internal tool events: forward by iterating nested stream and… we need them for UX. Implement nested stream + `side_events` list; after `Runner.run_streamed(Orchestrator)` completes each… can’t.

Look at how tests work — they care about phases. Emit `executing` by having the Orchestrator prompt imply tools, and in `map_agent_stream_event` when tool name is `delegate_task`, emit phase executing. Subagent granular tools: run nested stream and **synchronously** the outer cannot flush. Use queue:

```python
# In stream_chat emit():
event_queue: asyncio.Queue = asyncio.Queue()

async def drain_queue():
    while True:
        item = await event_queue.get()
        if item is None: return
        yield item  # can't yield from nested

```

Simplest working approach used in plan execution: **inside `on_invoke_tool`, run nested agent with `Runner.run` (non-streaming) for the ExecutionRecord; map no internal tools for v1 OR run streamed and discard internal tool SSE except counting tools_used.** Spec says emit tool SSE of subagent. So: streamed nested + put events on `asyncio.Queue`; outer `async for` uses a multiplexer.

Implement multiplexer in Task 3 orchestrator rewrite.

- [ ] **Step 1:** Write failing tests for enum validation, max delegations, restaurant_ops success JSON, menu disabled error.

- [ ] **Step 2:** Implement `delegate.py`.

- [ ] **Step 3:** Tests pass.

- [ ] **Step 4:** Commit `feat(assistant): add delegate_task tool for subagents`

---

### Task 3: Context loader inputs

**Files:**
- Modify: `backend/app/modules/assistant/agent/workflow/context_loader.py`
- Modify: `backend/tests/modules/test_assistant_workflow_context_loader.py`
- Modify/delete: `backend/tests/modules/test_menu_import_responder_input.py`

**Interfaces:**
- Produces: `orchestrator_input(context: WorkflowContext) -> str` (history, user request with attachments, import session, capabilities note for menu_import_enabled)
- Produces: `restaurant_ops_input(context, task: str) -> str`
- Produces: `menu_subagent_input(context, task: str) -> str`
- Removes: `router_input`, `executor_input` (w/ route), `evaluator_input`, `responder_input`, `menu_import_responder_input`

- [ ] **Step 1:** Add new input builders; update tests; delete responder input tests.

- [ ] **Step 2:** Commit `refactor(assistant): orchestrator and subagent prompt inputs`

---

### Task 4: Rewrite `WorkflowOrchestrator.stream_chat`

**Files:**
- Modify: `backend/app/modules/assistant/agent/workflow/orchestrator.py`
- Modify: `backend/app/modules/assistant/agent/workflow/sse.py` (default source orchestrator)
- Modify: `backend/app/modules/assistant/agent/workflow/stream_mapping.py` (optional: keep router parser unused or delete)
- Modify: `backend/app/modules/assistant/agent/workflow/__init__.py` docstring
- Test: rewrite `backend/tests/modules/test_assistant_workflow_orchestrator.py`

**Behavior:**
1. Load runtime / build run_context (unchanged spirit).
2. Create `event_queue` + `delegation_counter`.
3. `build_delegate_task_tool(...)` + `build_orchestrator_agent(tools=[delegate_tool])`.
4. `yield phase_event("orchestrating")`.
5. Multiplex Orchestrator `run_streamed` text/tool events with queue events from nested subagents.
6. On complete: if menu was delegated or quiz pending → quiz SSE; `message.complete`; persist (with quiz history formatter when questions).
7. Fallback message if no content.
8. Delete `_stream_router`, `_run_evaluator`, `_stream_executor`, `_stream_responder`, `_stream_menu_import` as separate paths.

**Test cases to rewrite:**
- Reply-only: Orchestrator streams text, no nested agents → phases `context`, `orchestrating`
- Ops delegate: Orchestrator tool call mocked via nested Runner when agent name is RestaurantOpsSubagent; Orchestrator then text
- Re-delegate: two nested ops runs (no evaluating phase)
- Menu: MenuSubagent then Orchestrator text + optional quiz from patched session helpers

- [ ] **Step 1:** Rewrite tests to new agent names/phases (fail).
- [ ] **Step 2:** Implement orchestrator rewrite + SSE bridge.
- [ ] **Step 3:** Tests pass.
- [ ] **Step 4:** Commit `feat(assistant): run chat via orchestrator delegate_task`

---

### Task 5: Cleanup references + full test suite

**Files:**
- Grep and fix remaining Router/Evaluator/Responder/MenuImportResponder/`WorkflowRouteDecision` imports in backend
- Update `skills/menu_import/SKILL.md` mentions of responder pair if present
- Run: `cd backend && .venv/bin/pytest tests/modules/test_assistant_workflow_*.py tests/modules/test_menu_import_*.py tests/modules/test_assistant_agent_service.py -q`

- [ ] **Step 1:** Fix stragglers.
- [ ] **Step 2:** Full focused pytest green.
- [ ] **Step 3:** Commit `chore(assistant): remove legacy router responder evaluator path`
- [ ] **Step 4:** Update spec status line to implemented / plan done.

---

## Self-review vs spec

| Spec requirement | Task |
|------------------|------|
| Orchestrator + single `delegate_task` | 1, 2, 4 |
| Enum `restaurant_ops_subagent` \| `menu_subagent` | 2 |
| Result returns to Orchestrator | 2, 4 |
| Remove Responder + Evaluator + MenuImportResponder | 1, 4, 5 |
| Direct user reply / no-tool greetings | 4 |
| Re-delegate max 3 | 2 |
| Quiz from session DB | 4 |
| public_menu_url on tool result | 2 |
| ORCHESTRATOR_MAX_TURNS=8 | 4 |
| Tests reply / ops / import / re-delegate | 4 |

No TBD placeholders left for implementers beyond the explicit SSE bridge choice documented in Task 2.
