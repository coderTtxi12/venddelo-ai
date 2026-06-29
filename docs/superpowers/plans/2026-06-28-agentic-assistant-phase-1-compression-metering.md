# Agentic Assistant Phase 1 Compression + Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Base Phase 1 by adding in-process context compression and LLM usage metering for assistant chat turns.

**Architecture:** Context compression is deterministic in v1: it estimates token pressure, keeps the recent raw window, and injects a compact `<state_snapshot>` as an assistant history message sent only to the LLM. LLM usage metering persists one PostgreSQL row per provider call in the same Cloud Run SSE request lifecycle; failures are logged and do not fail the chat turn.

**Tech Stack:** FastAPI SSE, SQLAlchemy/Alembic, existing `LLMProviderPort`, pytest, ruff.

---

## File Structure

- Create `backend/app/modules/assistant/context/compressor.py`
  - Estimate tokens and build deterministic compressed history.
- Create `backend/app/modules/assistant/usage/pricing_catalog.py`
  - Compute estimated USD cost for known models, zero for stub/unknown.
- Create `backend/app/modules/assistant/usage/schemas.py`
  - DTOs for usage records and API summaries.
- Create `backend/app/modules/assistant/usage/adapters.py`
  - SQLAlchemy insert + aggregate queries.
- Create `backend/app/modules/assistant/usage/recorder.py`
  - Best-effort recorder wrapper.
- Create migration `0033_assistant_llm_usage.py`
  - Adds `assistant_llm_usage`.
- Modify `backend/app/db/models/assistant.py`
  - Add `AssistantLLMUsage`.
- Modify `backend/app/db/models/__init__.py`
  - Export usage model.
- Modify `backend/app/db/uow.py`
  - Add `assistant_usage`.
- Modify `backend/app/core/llm/ports.py`
  - Add `LLMUsageRecord`.
- Modify `backend/app/infra/llm/stub_provider.py` and `openai_provider.py`
  - Emit usage in `message.complete`.
- Modify `backend/app/modules/assistant/service.py`
  - Apply compressed history before provider call and include estimated request usage metadata.
- Modify `backend/app/modules/assistant/conversation_service.py`
  - Record usage at final completion.
- Modify `backend/app/modules/assistant/api.py`
  - Add `GET /restaurants/{rid}/assistant/usage`.

## Tasks

### Task 1: Context Compression
- [ ] Write failing tests in `backend/tests/modules/test_context_compressor.py`.
- [ ] Implement deterministic compressor.
- [ ] Verify tests pass.

### Task 2: Usage Metering Core
- [ ] Write failing tests in `backend/tests/modules/test_assistant_usage.py`.
- [ ] Add model, schema, pricing, adapter, recorder, and UoW wiring.
- [ ] Verify tests pass.

### Task 3: Provider Usage Events
- [ ] Write failing tests for stub provider usage payload.
- [ ] Add `LLMUsageRecord` and provider usage payloads.
- [ ] Verify tests pass.

### Task 4: Chat Integration
- [ ] Write failing API test that chat persists usage and compressed context metadata.
- [ ] Apply compressor in `AssistantService`.
- [ ] Record usage in `AssistantConversationService`.
- [ ] Add usage summary API.
- [ ] Verify API tests pass.

### Task 5: Final Verification
- [ ] Run focused assistant tests.
- [ ] Run ruff on changed assistant modules and tests.
