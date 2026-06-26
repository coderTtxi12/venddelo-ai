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
  "history": [
    { "role": "user", "content": "Hola" },
    { "role": "assistant", "content": "¡Hola! ¿En qué te ayudo?" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Latest user turn (required) |
| `history` | `array` | Prior turns (`user` \| `assistant`), max 40 |

### SSE events

| Event | Payload | When |
|-------|---------|------|
| `content.delta` | `{ "delta": "..." }` | Token chunk |
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
| System prompt | `app/modules/assistant/prompts.py` | Static Venddelo assistant instructions |
| History | Request `history[]` | Prior conversation turns |
| User prompt | Request `message` | Current user input |

The service builds the LLM message list as:

```
[system] → [...history] → [user: message]
```

## Provider abstraction

Chat uses **`LLMProviderPort`** (`app/core/llm/ports.py`), separate from job-based `AIGatewayPort`.

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
