# Assistant Chat Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-agnostic streaming assistant chat endpoint (OpenAI first) and connect the restaurant-owner frontend chat to it via SSE.

**Architecture:** Introduce `LLMProviderPort` separate from job-based `AIGatewayPort`. `AssistantService` builds system + history + user prompts, streams SSE events (`content.delta`, `message.complete`). Factory selects provider via `LLM_PROVIDER` env (`stub` | `openai`, extensible to `openrouter`).

**Tech Stack:** FastAPI `StreamingResponse`, OpenAI Python SDK (`stream=True`), pytest, Next.js fetch + SSE parser.

---

## Spec

### API

`POST /api/v1/restaurants/{restaurant_id}/assistant/chat`

- Auth: Bearer JWT + `require_owned_restaurant`
- Request: `{ "message": string, "history": [{ "role": "user"|"assistant", "content": string }] }`
- Response: `text/event-stream`

SSE events:

| Event | Data |
|-------|------|
| `content.delta` | `{ "delta": "..." }` |
| `message.complete` | `{ "message_id": "...", "content": "..." }` |
| `error` | `{ "code": "...", "message": "..." }` |

### Prompts

- **System prompt:** `app/modules/assistant/prompts.py` — static Venddelo assistant instructions
- **User prompt:** latest `message` from request; `history` passed as prior turns (no system role in history)

### Provider abstraction

```python
class LLMProviderPort(ABC):
    def stream_chat(self, request: ChatCompletionRequest) -> Iterator[ChatStreamEvent]: ...
```

`build_llm_provider(settings)` returns `OpenAILLMProvider` or `StubLLMProvider`.

---

## Tasks

### Task 1: LLM port + stub provider + tests

**Files:**
- Create: `backend/app/core/llm/ports.py`
- Create: `backend/app/infra/llm/stub_provider.py`
- Create: `backend/app/infra/llm/factory.py`
- Test: `backend/tests/services/test_assistant_service.py`

### Task 2: Assistant service + prompts

**Files:**
- Create: `backend/app/modules/assistant/prompts.py`
- Create: `backend/app/modules/assistant/schemas.py`
- Create: `backend/app/modules/assistant/service.py`

### Task 3: OpenAI provider

**Files:**
- Create: `backend/app/infra/llm/openai_provider.py`
- Modify: `backend/app/core/config.py` — `llm_provider: str = "stub"`

### Task 4: API endpoint + router

**Files:**
- Create: `backend/app/modules/assistant/api.py`
- Modify: `backend/app/api/v1/router.py`

### Task 5: API integration tests

**Files:**
- Create: `backend/tests/api/test_assistant_api.py`

### Task 6: Frontend API client + panel integration

**Files:**
- Create: `frontend/src/lib/api/assistant.ts`
- Modify: `frontend/src/components/assistant/AssistantChatPanel.tsx`
