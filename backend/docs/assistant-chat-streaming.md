# Assistant Chat Streaming API

Backend endpoint for the restaurant-owner assistant chat. Responses are streamed via **Server-Sent Events (SSE)**.

## Endpoint

```
POST /api/v1/restaurants/{restaurant_id}/assistant/chat
```

- **Auth:** `Authorization: Bearer <jwt>`
- **Ownership:** caller must own the restaurant
- **Request:** `application/json`
- **Response:** `text/event-stream`

### Request body

```json
{
  "message": "Quiero agregar un producto nuevo",
  "profile_version": 2,
  "profile_snapshot": {
    "display_name": "Luna",
    "identity_markdown": "# IDENTITY — Who am I?",
    "behavior_markdown": "# BEHAVIOR — How I act",
    "menu_markdown": "# MENU — Menu knowledge",
    "enabled_skill_ids": ["menu_read", "menu_write"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Latest user turn (required) |
| `profile_version` | `integer` | Required profile version known by the client |
| `profile_snapshot` | `object` | Optional prompt snapshot, used only when version matches the server profile |

### SSE events

| Event | Payload | When |
|-------|---------|------|
| `content.delta` | `{ "delta": "..." }` | Token chunk |
| `agent.phase` | `{ "phase": "analyzing" }` | Agent phase transition |
| `agent.status` | `{ "status": "processing" }` | UI should show processing dots |
| `message.complete` | `{ "message_id": "uuid", "content": "..." }` | Stream finished |
| `error` | `{ "code": "...", "message": "..." }` | Provider failure |

Example stream:

```
event: content.delta
data: {"delta": "Hola"}

event: content.delta
data: {"delta": ", "}

event: message.complete
data: {"message_id": "abc-123", "content": "Hola, ¿qué producto quieres agregar?"}
```

## Prompt architecture

| Layer | Source | Role |
|-------|--------|------|
| System prompt | `app/modules/assistant/prompts.py` | Static Venddelo assistant instructions, written in English |
| Profile prompt layers | `restaurant_assistant_profiles` | Identity, behavior, and menu knowledge, default templates written in English |
| History | `assistant_messages` | Prior conversation turns |
| User prompt | Request `message` | Current user input |

The service builds the LLM message list as:

```
[system] → [...history] → [user: message]
```

System-authored prompt layers are English. Owners usually write user prompts in Spanish, and the assistant responds in Spanish by default unless the user asks for another language.

`profile_snapshot` is trusted only for prompt composition and only when its `profile_version` matches the server-side profile version. Entitlements are always recalculated server-side.

## Cloud Run Runtime

The assistant runtime runs inside the same backend Cloud Run container and within the SSE request lifecycle. Do not add Celery, workers, Cloud Tasks, or external job queues for v1 assistant turns. Redis is used for cache and lane locks only.

## Provider abstraction

Chat uses **`LLMProviderPort`** (`app/core/llm/ports.py`). Legacy job-based `AIGatewayPort` was removed; future extraction, optimization, and translation run through the agentic assistant.

```
build_llm_provider(settings) → LLMProviderPort
  ├── stub      (default, tests, local dev without API key)
  ├── openai    (OpenAI streaming)
  └── openrouter (planned)
```

### Configuration

```env
LLM_PROVIDER=openai   # stub | openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

If `LLM_PROVIDER=openai` but the key is missing, the factory falls back to `stub`.

## Module layout

```
app/modules/assistant/
  api.py       # SSE endpoint
  service.py   # Prompt assembly + stream orchestration
  prompts.py   # System prompt
  schemas.py   # Request/response DTOs

app/core/llm/ports.py
app/infra/llm/
  factory.py
  openai_provider.py
  stub_provider.py
```

## Frontend integration

Client: `frontend/src/lib/api/assistant.ts` → `streamAssistantChat()`

Panel: `frontend/src/components/assistant/AssistantChatPanel.tsx`

Requires `accessToken` (auth) and `restaurantId` (orders context).

## Form complements

Interactive forms are documented separately in:

`frontend/docs/assistant-chat-form-complement.md`

Future: backend may attach a `complement` object on `message.complete`.

## Tests

```bash
cd backend
pytest tests/services/test_assistant_service.py tests/api/test_assistant_api.py tests/test_llm_factory.py -v
```

## Future work

- [ ] `openrouter` provider implementation
- [ ] Dynamic provider/model routing per request
- [ ] Persist conversation threads
- [ ] Multimodal attachments (images/documents)
- [ ] `complement` in `message.complete` for inline forms
