# Agentic Assistant — Phase 0 + 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans.

**Goal:** Ship assistant profile + entitlements (Phase 0) and in-process agent runtime skeleton (Phase 1) on **single Cloud Run container** — no Celery/workers; agent loop + tools run inside the SSE request.

**Architecture:** Profile/entitlements in Postgres + Redis cache. `PromptComposer` builds system prompt from profile. `ConversationLaneQueue` uses Redis `SET NX` (or in-process fallback) so one turn per conversation. All LLM calls synchronous within the streaming generator.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Redis, existing `LLMProviderPort`.

**Cloud Run constraint:** No background job workers. Metering/compression deferred to Phase 1 follow-up; lane lock TTL covers long streams.

**Prompt language constraint:** All system prompts and backend-provided templates are written in English. User input is normally Spanish; assistant output defaults to Spanish.

**Snapshot safety:** Use `profile_snapshot` only when `profile_version` matches the server profile version. On mismatch, ignore the snapshot and read Redis/DB.

---

### Task 1: Migration + models — `0032_assistant_profile_entitlements`

### Task 2: Profile module — templates, repo, service, cache, API GET/PATCH

### Task 3: Entitlements — catalog, resolver, overrides repo

### Task 4: Prompt composer + chat gate (display_name required)

### Task 5: Lane queue + SSE `agent.phase` events

### Task 6: Tests + frontend profile API wiring
