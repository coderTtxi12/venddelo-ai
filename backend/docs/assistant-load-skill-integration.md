# Assistant `load_skill` Integration (disabled)

This document describes how on-demand skill guides were wired into the restaurant
assistant, and how to restore that behavior later. The `SKILL.md` files under
`app/modules/assistant/skills/*/SKILL.md` are **kept on disk**; only runtime
loading into the agent was turned off.

## What “loading a skill” meant

A **skill** in Venddelo is two things:

1. **Tools** — callable functions (`list_products`, `update_product`, …) registered
   per skill executor (`MenuReadSkill`, `MenuWriteSkill`, …).
2. **Guide** — the long-form `SKILL.md` behavioral document (workflows, field
   semantics, do/don’t lists).

Tools were always available to the executor when a skill was entitled. The
`load_skill` tool was the **on-demand guide loader**: it read `SKILL.md` at runtime
and returned the markdown body to the model mid-turn.

Separately, the **system prompt** included a short “Active skills” section built from
YAML frontmatter (`load_skill_metadata`) — not the full guide.

## Architecture (before disable)

```
SKILL.md (on disk)
    │
    ├─ load_skill_metadata() ──► system prompt “Active skills” bullets
    │
    └─ load_skill_guide() ─────► load_skill tool result (full guide text)

SkillRegistry + entitlements ──► executor FunctionTools (menu_read, menu_write, …)
build_registry_function_tools() ─ also appended load_skill FunctionTool
```

### Key files

| File | Role |
|------|------|
| `app/modules/assistant/skills/markdown.py` | `load_skill_metadata()`, `load_skill_guide()` read `SKILL.md` |
| `app/modules/assistant/agent/tools.py` | `_build_load_skill_tool()`, appended to executor tools |
| `app/modules/assistant/agent/prompt_composer.py` | `compose_system_prompt()` — “Active skills” section |
| `app/modules/assistant/agent/workflow/context_loader.py` | `build_skill_catalog()` — planner context + `load_skill` line |
| `app/modules/assistant/agent/workflow/tool_catalog.py` | `LOAD_SKILL_DEFINITION`, Meta tool group for planner index |
| `app/modules/assistant/agent/workflow/prompts.py` | Planner/executor/replanner rules mentioning `load_skill` |
| `app/modules/assistant/agent/activity_emit.py` | UI label for `load_skill` telemetry (if present) |

### `load_skill` tool contract

**Input:**

```json
{ "skill_id": "menu_write" }
```

`skill_id` had to be in `effective_skill_ids` for the restaurant.

**Output:**

```json
{
  "ok": true,
  "summary": "Loaded guide for menu_write",
  "data": {
    "skill_id": "menu_write",
    "guide": "<full SKILL.md body without frontmatter>"
  }
}
```

### Prompt instructions (typical flow)

1. **Planner** — for complex write/import/promo plans, first step: `load_skill` with
   the relevant skill id.
2. **Executor** — call `load_skill` when the plan says so, then run mutate tools.
3. **SKILL.md files** — cross-reference each other (“call `load_skill(menu_read)` first”).

### What stayed enabled without `load_skill`

- Entitled **tools** still register on the executor via `build_registry_function_tools()`.
- `build_skill_catalog()` still lists skill ids, short descriptions, and tool names for
  the planner (metadata only, not full guides).
- `tests/modules/test_skill_markdown.py` still validates `SKILL.md` parsing.

## What was disabled (current state)

| Change | Location |
|--------|----------|
| Removed `load_skill` FunctionTool | `agent/tools.py` |
| Removed Meta group + `LOAD_SKILL_DEFINITION` | `workflow/tool_catalog.py` |
| Commented out “Active skills” system-prompt section | `agent/prompt_composer.py` |
| Removed `load_skill` line from skill catalog | `workflow/context_loader.py` |
| Removed planner/executor/replanner `load_skill` rules | `workflow/prompts.py` |

**Not deleted:** any `SKILL.md` file, `markdown.py` helpers, or skill executors.

## How to re-enable

### 1. Restore the executor tool (`agent/tools.py`)

- Re-import `load_skill_guide` from `skills.markdown`.
- Re-add `LOAD_SKILL_TOOL_NAME = "load_skill"`.
- Restore `_build_load_skill_tool(effective_skill_ids)`.
- In `build_registry_function_tools()`, append:
  `tools.append(_build_load_skill_tool(effective_skill_ids))`.

Use git history or this doc’s contract section as reference.

### 2. Restore planner tool index (`workflow/tool_catalog.py`)

- Re-add the `("Meta", ["load_skill"])` entry to `TOOL_GROUPS`.
- Re-add `LOAD_SKILL_DEFINITION` and `tools["load_skill"] = LOAD_SKILL_DEFINITION`
  inside `_collect_tool_definitions()`.

### 3. Restore system prompt section (`agent/prompt_composer.py`)

- Re-import `load_skill_metadata` and `SKILL_CATALOG`.
- Uncomment the `if effective_skill_ids:` block that builds `## Active skills`
  and mentions `load_skill(skill_id)`.

### 4. Restore workflow context (`workflow/context_loader.py`)

- Re-append to `build_skill_catalog()`:
  `- **load_skill**: …` (Spanish or English label).

### 5. Restore agent instructions (`workflow/prompts.py`)

Re-add rules in:

- `PLANNER_INSTRUCTIONS` — first step `load_skill` for complex flows.
- `EXECUTOR_INSTRUCTIONS` — call `load_skill` when plan says so.
- `REPLANNER_INSTRUCTIONS` — same as planner.

### 6. Tests

- `tests/modules/test_assistant_agent_service.py` — expect `load_skill` in tool names
  again (or use `LOAD_SKILL_TOOL_NAME` constant).
- Existing `test_skill_markdown.py` / `test_menu_import_skill_md.py` should still pass
  without changes (they test files on disk, not runtime wiring).

### 7. Optional: activity telemetry

If `agent/activity_emit.py` maps tool names to UI labels, restore the
`load_skill` entry and `LOAD_SKILL_TOOL_NAME` import.

## Verification checklist

After re-enabling:

1. `pytest tests/modules/test_assistant_agent_service.py -k tools`
2. `pytest tests/modules/test_skill_markdown.py`
3. Manual chat: ask for a complex `menu_import` flow — planner should schedule
   `load_skill` before mutate steps; executor should return guide text in tool output.
4. Confirm system prompt (logs/LangSmith) includes `## Active skills` when skills are
   entitled.

## Design note

`load_skill` kept context small: only short metadata in the system prompt, full
guides fetched when needed. Alternatives if you revisit the design:

- **Eager injection** — embed selected `SKILL.md` bodies in the system prompt (higher
  token cost, simpler agent).
- **Planner-only guides** — inject guides into planner input, not executor.
- **No guides** — rely on tool descriptions + `tool_catalog` compact index (current
  disabled state).
