# Assistant encrypted reasoning — Implementation Plan

> **For agentic workers:** Implement inline (tiny change). No commits unless the user asks.

**Goal:** `store=False` + `response_include=["reasoning.encrypted_content"]` on all assistant Agents SDK agents via shared model settings.

**Architecture:** One factory (`build_assistant_model_settings`) already used by Orchestrator and both subagents.

**Tech Stack:** OpenAI Agents Python SDK `ModelSettings`, existing Settings reasoning fields.

## Task 1: Model settings + test

**Files:**
- Modify: `backend/app/modules/assistant/agent/model_settings.py`
- Modify: `backend/tests/modules/test_assistant_model_settings.py`

- [ ] Update `build_assistant_model_settings` with `store=False` and `response_include`
- [ ] Extend unit test assertions
- [ ] Run `pytest tests/modules/test_assistant_model_settings.py -q`
