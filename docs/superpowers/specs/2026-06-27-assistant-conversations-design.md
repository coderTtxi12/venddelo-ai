# Assistant Conversations — Design Spec

**Date:** 2026-06-27  
**Status:** Approved for implementation

## Goal

Persist multi-conversation assistant chat history per restaurant. Each thread has a `conversation_id`. The backend is the source of truth for message history; Redis caches hot reads with automatic fallback when `REDIS_URL` is unset or unavailable.

## Scope

- Restaurant owners see a list of past conversations and can switch between them.
- Messages survive page reloads and work across devices.
- Streaming chat behavior is unchanged in the UI.
- Conversations are scoped to `restaurant_id` (not global per user).

Out of scope (phase 2): AI-generated titles, full-text search, shared staff threads, attachment persistence in DB metadata.

## Data Model (Postgres)

### `assistant_conversations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `conversation_id` |
| `restaurant_id` | UUID FK → restaurants | CASCADE delete |
| `title` | VARCHAR(120) | Auto from first user message |
| `last_message_at` | TIMESTAMPTZ | For sorting list |
| `is_active` | BOOLEAN | Soft delete |
| `deleted_at` | TIMESTAMPTZ NULL | Soft delete timestamp |
| `created_at`, `updated_at` | TIMESTAMPTZ | Standard |

Indexes: `(restaurant_id, last_message_at DESC)`, `(restaurant_id, is_active)`.

### `assistant_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `message_id` in SSE |
| `conversation_id` | UUID FK | CASCADE delete |
| `role` | VARCHAR | `user` \| `assistant` |
| `content` | TEXT | Final markdown/plain text |
| `metadata` | JSONB NULL | Future: attachments, forms |
| `created_at` | TIMESTAMPTZ | Chronological order |

Indexes: `(conversation_id, created_at)`.

## Redis Cache (optional)

Uses existing `CachePort` via `build_cache()` — `NullCacheAdapter` when Redis is missing.

| Key | Value | TTL |
|-----|-------|-----|
| `assistant:conv-list:{restaurant_id}` | JSON array of conversation summaries | `assistant_conversation_cache_ttl_seconds` (default 300) |
| `assistant:conv-msgs:{conversation_id}` | JSON array of last N messages for LLM context | same TTL |

**Invalidation:** On create conversation, append message, archive/delete conversation — delete list key for restaurant and messages key for conversation.

**Read path:** Try cache → on miss load from DB → populate cache.

## API

All routes require `require_owned_restaurant` and verify `conversation.restaurant_id == restaurant.id`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/restaurants/{id}/assistant/conversations` | Paginated list (cursor on `last_message_at`, `id`) |
| POST | `/restaurants/{id}/assistant/conversations` | Create empty thread |
| GET | `/restaurants/{id}/assistant/conversations/{cid}` | Single conversation |
| GET | `/restaurants/{id}/assistant/conversations/{cid}/messages` | Paginated messages |
| PATCH | `/restaurants/{id}/assistant/conversations/{cid}` | Update title / archive |
| DELETE | `/restaurants/{id}/assistant/conversations/{cid}` | Soft delete |
| POST | `/restaurants/{id}/assistant/conversations/{cid}/chat` | SSE stream |

### Chat request body (replaces stateless history)

```json
{ "message": "Crear una promoción" }
```

### Chat SSE `message.complete` payload

```json
{
  "conversation_id": "uuid",
  "message_id": "uuid",
  "content": "..."
}
```

### Server flow (POST chat)

1. Validate conversation ownership.
2. Insert user message in DB.
3. Load last N messages (cache → DB) for LLM context.
4. Stream LLM response.
5. On complete: insert assistant message, update `last_message_at` and title (if first exchange).
6. Invalidate Redis keys.

## Frontend

- Conversation list under chat header (scrollable, active state).
- "Nueva conversación" creates thread via API and clears message view.
- Selecting a thread loads messages from API.
- Send uses `POST .../conversations/{cid}/chat` only (no client `history`).
- Welcome message shown only for brand-new empty threads (not persisted).

## Config

```env
ASSISTANT_CONVERSATION_CACHE_TTL_SECONDS=300
ASSISTANT_LLM_CONTEXT_MESSAGE_LIMIT=40
```

## Security

- `conversation_id` must belong to `restaurant_id` in URL.
- No cross-restaurant access.
- Owner auth unchanged (Supabase JWT + `require_owned_restaurant`).

## Testing

- Repository: create, list, messages, soft delete.
- Cache: hit/miss/invalidation with fakeredis; null adapter falls back to DB.
- API: list, create, stream persists messages, 403 wrong owner.
- Service: title auto-generation from first user message.
