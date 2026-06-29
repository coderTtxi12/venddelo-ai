# Phase 6 — AI Services (extraction, optimization, translation) — Design

> **Status: superseded / removed from codebase (2026-06-27).**  
> `AIGatewayPort`, `AIService`, and `POST ai/jobs/*` were deleted. See `2026-06-27-agentic-assistant-design.*.md` §10 for the agentic replacement via `LLMProviderPort`.  
> Historical reference only — do not implement from this document.

> Status: approved (continuing). Implements Phase 6 of `docs/PROJECT_PLANNING.en.md`.

## 1. Goal

AI pipeline behind `AIGatewayPort` (swappable provider). Restaurant owners upload a menu
→ async extraction job → draft catalog; optional optimization (images + descriptions) with
`ai_artifacts` for undo; palette selection; public menu translation when `locale` ≠
`original_language`. Jobs are pollable via REST.

## 2. Key decisions

- **AIGatewayPort** in `core/ai_gateway.py` with typed DTOs for extraction, image, copy,
  palette, and batch translation.
- **Providers:** `StubAIGateway` (default, deterministic, tests) + `OpenAIGateway` when
  `OPENAI_API_KEY` is set (translation + description copy; extraction uses vision stub
  fallback to stub if unsupported MIME).
- **Jobs:** new `ai_jobs` table (Alembic `0003`); statuses `pending` → `processing` →
  `completed`|`failed`; poll `GET /restaurants/{rid}/ai/jobs/{job_id}`.
- **Orchestration:** `AIService` uses gateway + storage + menu/ai/translations repos;
  long work runs via FastAPI `BackgroundTasks` (MVP; Celery later).
- **Palettes:** fixed list `["sunset","ocean","forest","classic","midnight"]` in
  `core/palettes.py`.
- **Translation:** `TranslationService` + `TranslatedMenuService` wraps `MenuCacheService`;
  if `locale` matches `original_language` → no translation; else upsert `menu_translations`
  with `source_hash` (SHA256 of source text), cache translated JSON in Redis.
- **Undo:** `POST /restaurants/{rid}/ai/artifacts/{id}/revert` restores `original_value` on
  entity field and marks artifact `reverted`.
- **Supported locales (MVP):** `es`, `en`, `pt`, `fr`, `de`; fallback to `en` if unsupported.

## 3. API surface (`/api/v1`, auth + ownership)

```
POST   /restaurants/{rid}/ai/jobs/extract-menu     # multipart: file
POST   /restaurants/{rid}/ai/jobs/optimize-menu    # optimize all product descriptions + images
POST   /restaurants/{rid}/ai/jobs/pick-palette     # uses restaurant logo if present
GET    /restaurants/{rid}/ai/jobs/{job_id}
POST   /restaurants/{rid}/ai/artifacts/{id}/revert
GET    /restaurants/{rid}/ai/artifacts             # list for restaurant
```

Public (updated):
```
GET /public/menu/{subdomain}?locale=en   # translated when locale ≠ original_language
```

## 4. Job types & results

| job_type | input | result_json |
|----------|-------|-------------|
| `extract_menu` | storage path of upload | `{categories_created, products_created}` |
| `optimize_menu` | restaurant_id | `{products_optimized, images_optimized}` |
| `pick_palette` | restaurant_id | `{palette}` |

## 5. Testing

- Unit: StubAIGateway, AIService extraction/optimize/revert, TranslationService hash/apply.
- Integration: job extract → poll completed → categories exist; public menu `locale=en`
  returns translated product name (stub prefix `[en]`).
- fakeredis + local Postgres; no live OpenAI required in CI.

## 6. Definition of Done

- AIGatewayPort + stub (+ optional OpenAI adapter).
- ai_jobs migration + repository.
- AIService + API endpoints + background processing.
- Translation wired into public menu GET.
- Undo endpoint.
- Tests green; commit list for user.
