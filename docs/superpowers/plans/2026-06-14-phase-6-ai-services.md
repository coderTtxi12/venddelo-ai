# Phase 6 — AI Services — Implementation Plan

> Spec: `docs/superpowers/specs/2026-06-14-phase-6-ai-services-design.md`

## Tasks

1. **AIGatewayPort** — `core/ai_gateway.py`, `core/palettes.py`, stub + OpenAI adapters
2. **ai_jobs** — migration `0003`, model, repository, schemas
3. **AIService** — extract, optimize, palette, revert; background runners
4. **API** — `/restaurants/{rid}/ai/*` endpoints (multipart extract)
5. **Translation** — `TranslationService`, `TranslatedMenuService`, wire public GET
6. **Tests** — gateway, service, API, translation; 87 tests green

## Verification

```bash
cd backend
pytest -q
ruff check app tests
black --check app tests
mypy app
alembic upgrade head  # applies 0003_ai_jobs
```

## Optional env

- `OPENAI_API_KEY` — enables OpenAI for translation/description (stub fallback)
- `OPENAI_MODEL` — default `gpt-4o-mini`
