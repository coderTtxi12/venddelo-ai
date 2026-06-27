# Assistant Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Persist per-restaurant assistant chat threads with Redis-cached reads and null fallback.

**Architecture:** Postgres tables + repository in UoW + `AssistantConversationCache` on `CachePort` + `AssistantConversationService` orchestrating persistence around existing `AssistantService` streaming.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Redis/NullCacheAdapter, Next.js React.

**Spec:** `docs/superpowers/specs/2026-06-27-assistant-conversations-design.md`

---

### Task 1: Database layer

- Create `app/db/models/assistant.py`
- Migration `0030_assistant_conversations.py`
- Register models in `app/db/models/__init__.py`

### Task 2: Repository + cache

- `app/modules/assistant/repository.py`
- `app/modules/assistant/adapters.py`
- `app/modules/assistant/conversation_cache.py`
- Wire `uow.assistant` in `app/db/uow.py`

### Task 3: Service + schemas + API

- Extend `schemas.py`
- `conversation_service.py`
- Update `api.py` endpoints
- Config: `assistant_conversation_cache_ttl_seconds`, `assistant_llm_context_message_limit`

### Task 4: Tests

- `tests/services/test_assistant_conversation_service.py`
- `tests/api/test_assistant_conversations_api.py`
- Update `tests/api/test_assistant_api.py`

### Task 5: Frontend

- Extend `lib/api/assistant.ts`
- `AssistantConversationList.tsx`
- Update `AssistantChatPanel.tsx` + CSS
