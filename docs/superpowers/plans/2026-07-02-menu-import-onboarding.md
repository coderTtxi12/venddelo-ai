# Menu Import Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full `menu_import` skill so owners can upload menu documents, OCR-extract content, clarify rules, collect photos, apply batches to the digital menu, map images, optionally enhance copy/photos, and persist import session state in Postgres.

**Architecture:** New assistant import upload API + chat attachment refs; Postgres tables `assistant_menu_import_sessions` and `digital_menu_themes`; skill `menu_import` with batch tools that loop internally via `MenuService`/`PromotionService`; vision OCR via existing `VisionPort` + `pymupdf`/`python-docx` preprocessing; frontend uploads files before SSE chat.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, OpenAI vision (`gpt-5.4-nano-2026-03-17`), Supabase Storage, React/Next.js assistant chat, pymupdf, python-docx.

**Spec:** [`docs/superpowers/specs/2026-07-02-menu-import-onboarding-design.es.md`](../specs/2026-07-02-menu-import-onboarding-design.es.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `migrations/versions/0035_digital_menu_themes.py` | Themes catalog table |
| `migrations/versions/0036_assistant_menu_import_sessions.py` | Import session table |
| `backend/data/digital_menu_themes.json` | Sync input (generated) |
| `backend/scripts/sync_digital_menu_themes.py` | UPSERT themes |
| `frontend/scripts/export-digital-menu-themes.mjs` | Export TS catalog → JSON |
| `app/db/models/menu_import.py` | SQLAlchemy models |
| `app/modules/assistant/import_assets.py` | Upload handler + validation |
| `app/modules/assistant/schemas.py` | ChatAttachmentRef |
| `app/modules/assistant/skills/menu_import/` | Skill package |
| `app/modules/assistant/entitlements/catalog.py` | Register skill |
| `app/core/config.py` | New limits |
| `frontend/src/lib/api/assistantImport.ts` | Upload API client |
| `frontend/src/components/assistant/AssistantChatPanel.tsx` | Wire uploads |

---

### Task 1: Config and dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add dependencies**

```text
pymupdf>=1.24.0
python-docx>=1.1.2
```

- [ ] **Step 2: Add settings**

```python
assistant_max_tool_iterations: int = 32
menu_import_batch_max_products: int = 15
menu_import_photo_match_confidence_threshold: float = 0.72
menu_import_max_source_bytes: int = 15 * 1024 * 1024
menu_import_max_photo_bytes: int = 5 * 1024 * 1024
```

- [ ] **Step 3: Update `.env.example`**

```env
ASSISTANT_MAX_TOOL_ITERATIONS=32
MENU_IMPORT_BATCH_MAX_PRODUCTS=15
MENU_IMPORT_PHOTO_MATCH_THRESHOLD=0.72
```

- [ ] **Step 4: Install and verify**

Run: `cd backend && .venv/bin/pip install pymupdf python-docx && .venv/bin/python -c "import fitz; import docx; print('ok')"`  
Expected: `ok`

---

### Task 2: Digital menu themes DB + sync

**Files:**
- Create: `migrations/versions/0035_digital_menu_themes.py`
- Create: `app/db/models/digital_menu_theme.py`
- Create: `backend/data/digital_menu_themes.json` (minimal seed: `original` + 3 themes for tests)
- Create: `backend/scripts/sync_digital_menu_themes.py`
- Create: `frontend/scripts/export-digital-menu-themes.mjs`
- Test: `backend/tests/modules/test_digital_menu_themes_sync.py`

- [ ] **Step 1: Write migration 0035**

Table columns per spec §4.4; PK `id` VARCHAR(64).

- [ ] **Step 2: SQLAlchemy model + repository**

`DigitalMenuThemeRepository.list_active()` ordered by `sort_order`.

- [ ] **Step 3: Export script (frontend)**

Node script imports `DIGITAL_MENU_THEMES` from catalog index and writes JSON array with `id`, `label`, `description`, `bestFor`, `recommendation`, `style_keywords` (from `context` or empty), `sort_order`.

- [ ] **Step 4: Sync script (backend)**

```python
# backend/scripts/sync_digital_menu_themes.py
# reads backend/data/digital_menu_themes.json → UPSERT
```

- [ ] **Step 5: Test sync**

```python
def test_sync_upserts_theme(db_session):
    # run sync with fixture JSON; assert original exists and is_active
```

Run: `pytest backend/tests/modules/test_digital_menu_themes_sync.py -v`

- [ ] **Step 6: Wire UoW** — add `digital_menu_themes` repo to `app/db/uow.py` if needed.

---

### Task 3: Import session DB

**Files:**
- Create: `migrations/versions/0036_assistant_menu_import_sessions.py`
- Create: `app/db/models/menu_import_session.py`
- Create: `app/modules/assistant/skills/menu_import/session_repository.py`
- Create: `app/modules/assistant/skills/menu_import/session_schemas.py`
- Test: `backend/tests/modules/test_menu_import_session.py`

- [ ] **Step 1: Migration with partial unique index**

`CREATE UNIQUE INDEX ... ON assistant_menu_import_sessions (restaurant_id) WHERE status NOT IN ('completed', 'cancelled')`

- [ ] **Step 2: Repository methods**

```python
class MenuImportSessionRepository:
    def get_active_for_restaurant(self, restaurant_id: UUID) -> MenuImportSession | None: ...
    def create(self, ...) -> MenuImportSession: ...
    def update(self, session: MenuImportSession) -> MenuImportSession: ...
    def cancel_active(self, restaurant_id: UUID) -> None: ...
```

- [ ] **Step 3: Tests**

```python
def test_only_one_active_session_per_restaurant(repo):
    repo.create(restaurant_id=r1, status="discovery")
    with pytest.raises(IntegrityError):
        repo.create(restaurant_id=r1, status="collecting_sources")
```

Run: `pytest backend/tests/modules/test_menu_import_session.py -v`

- [ ] **Step 4: Register in UoW** — `uow.menu_import_sessions`.

---

### Task 4: Import assets upload API

**Files:**
- Create: `app/modules/assistant/import_assets.py`
- Modify: `app/modules/assistant/api.py`
- Create: `app/modules/assistant/schemas.py` additions (`ImportAssetUploadDTO`, `ChatAttachmentRef`)
- Test: `backend/tests/modules/test_assistant_import_assets.py`

- [ ] **Step 1: Write failing upload test**

```python
def test_upload_menu_source_pdf(client, auth_headers, restaurant_id, pdf_bytes):
    r = client.post(
        f"/api/v1/restaurants/{restaurant_id}/assistant/import/assets?kind=menu_source",
        files={"file": ("menu.pdf", pdf_bytes, "application/pdf")},
        headers=auth_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["path"].startswith(f"restaurants/{restaurant_id}/import/menu_source/")
```

- [ ] **Step 2: Implement upload handler**

Validate MIME, size, kind; upload via `build_storage()`; return `{path, public_url, mime_type, size_bytes, original_name}`.

- [ ] **Step 3: Reject invalid paths/mimes**

- [ ] **Step 4: Run tests**

Run: `pytest backend/tests/modules/test_assistant_import_assets.py -v`

---

### Task 5: Chat request attachments

**Files:**
- Modify: `app/modules/assistant/schemas.py`
- Modify: `app/modules/assistant/conversation_service.py`
- Modify: `backend/tests/modules/test_assistant_conversations.py` (or new test file)

- [ ] **Step 1: Extend request schema**

Allow `message` min_length=0 when attachments non-empty; max 20 attachments.

- [ ] **Step 2: Persist attachment metadata**

Store in `assistant_messages.metadata.attachments` on user message insert.

- [ ] **Step 3: Validate storage paths belong to restaurant**

- [ ] **Step 4: Test POST chat with attachment refs (stub orchestrator)**

---

### Task 6: Document preprocessing

**Files:**
- Create: `app/modules/assistant/skills/menu_import/document_loader.py`
- Test: `backend/tests/modules/test_menu_import_document_loader.py`

- [ ] **Step 1: PDF page renderer**

```python
def load_pdf_pages(storage_path: str) -> list[tuple[bytes, str]]:  # (png_bytes, "image/png")
```

- [ ] **Step 2: DOCX text extractor**

```python
def load_docx_text(storage_path: str) -> str: ...
```

- [ ] **Step 3: Unified loader**

```python
def load_menu_source(path: str, mime_type: str) -> MenuSourcePayload:
    # pages: list[VisionPage] | text: str | None
```

- [ ] **Step 4: Tests with fixture PDF/DOCX in `backend/tests/fixtures/`**

---

### Task 7: Extraction prompt + vision pipeline

**Files:**
- Create: `app/modules/assistant/skills/menu_import/extraction_prompt.py`
- Create: `app/modules/assistant/skills/menu_import/extraction.py`
- Create: `app/modules/assistant/skills/menu_import/draft_schema.py` (Pydantic models)
- Test: `backend/tests/modules/test_menu_import_extraction.py`

- [ ] **Step 1: Pydantic models for extraction JSON** (§5 of spec)

- [ ] **Step 2: Build extraction prompt** with discovery context + clarification answers

- [ ] **Step 3: `extract_from_pages(pages, ctx)` using VisionPort**

Loop pages; merge categories by normalized name; accumulate `open_questions`.

- [ ] **Step 4: `extract_from_text(text, ctx)` using LLM text completion** (reuse LLMProviderPort or VisionPort without image)

- [ ] **Step 5: Stub vision test**

```python
def test_extraction_parses_taqueria_fixture(stub_vision):
    draft = extract_from_pages([FIXTURE_PAGE], context={})
    assert draft.categories[0].products[0].price_cents == 8500
```

Run: `pytest backend/tests/modules/test_menu_import_extraction.py -v`

---

### Task 8: Batch splitting

**Files:**
- Create: `app/modules/assistant/skills/menu_import/batching.py`
- Test: `backend/tests/modules/test_menu_import_batching.py`

- [ ] **Step 1: Split draft into batches of ≤15 products**

Prefer split by category; oversized category splits across batches.

```python
def split_draft_into_batches(draft: ImportDraft, max_products: int = 15) -> list[ImportBatch]: ...
```

- [ ] **Step 2: Tests for 37 products → 3 batches**

---

### Task 9: Apply batch engine

**Files:**
- Create: `app/modules/assistant/skills/menu_import/apply_batch.py`
- Test: `backend/tests/modules/test_menu_import_apply.py`

- [ ] **Step 1: Ref map builder**

During apply: `ref_map: dict[str, UUID]` for categories, products, option_items.

- [ ] **Step 2: Apply categories + products + option groups**

Use `MenuService` directly (same as menu_write), invalidate cache once at end.

- [ ] **Step 3: Apply promotions**

Resolve refs → UUIDs; `PromotionService.create_promotion(PromotionCreate(...))`.

- [ ] **Step 4: Integration test with test DB**

Create batch with 1 category, 2 products, 1 promo; assert DB rows.

Run: `pytest backend/tests/modules/test_menu_import_apply.py -v`

---

### Task 10: Photo matching

**Files:**
- Create: `app/modules/assistant/skills/menu_import/photo_match.py`
- Create: `app/modules/assistant/skills/menu_import/photo_match_prompt.py`
- Test: `backend/tests/modules/test_menu_import_photos.py`

- [ ] **Step 1: Vision prompt for N images vs product list**

- [ ] **Step 2: Classify matched / uncertain / unmatched using threshold from config**

- [ ] **Step 3: `resolve_uncertain_image` updates session JSON**

- [ ] **Step 4: `apply_photo_mappings` sets ProductUpdate.image_path**

---

### Task 11: Description enhancement preview/apply

**Files:**
- Create: `app/modules/assistant/skills/menu_import/description_enhance.py`

- [ ] **Step 1: `preview_description_enhancements`**

LLM generates `{product_id, current, proposed}` for products in session ref_map.

- [ ] **Step 2: `apply_description_enhancements`**

Reuse `bulk_update_product_descriptions` from menu_write bulk module.

---

### Task 12: Theme tools

**Files:**
- Create: `app/modules/assistant/skills/menu_import/theme_tools.py`

- [ ] **Step 1: `list_menu_themes`** — read from DB repo

- [ ] **Step 2: `recommend_menu_theme`** — LLM picks top 3 from active themes + discovery_answers

- [ ] **Step 3: `apply_menu_theme`** — validate id in DB; `RestaurantService.update(digital_menu_theme_id=...)`

---

### Task 13: menu_markdown re-enable

**Files:**
- Modify: `app/modules/assistant/profile/menu_markdown.py`
- Modify: `app/modules/assistant/agent/prompt_composer.py`
- Modify: `app/modules/assistant/profile/adapters.py`

- [ ] **Step 1: Set `MENU_MARKDOWN_ENABLED = True`**

- [ ] **Step 2: Uncomment persist/load paths in adapters**

- [ ] **Step 3: `update_menu_knowledge` tool** — append import notes section

- [ ] **Step 4: Update `test_prompt_composer.py` if needed**

---

### Task 14: Skill tools.py + SKILL.md

**Files:**
- Create: `app/modules/assistant/skills/menu_import/tools.py`
- Create: `app/modules/assistant/skills/menu_import/SKILL.md`
- Modify: `app/modules/assistant/entitlements/catalog.py`
- Test: `backend/tests/modules/test_menu_import_tools.py`

- [ ] **Step 1: Implement `MenuImportSkill` with all tools from spec §6**

Wire to session repo, extraction, apply, photo match, themes.

- [ ] **Step 2: Write SKILL.md** (frontmatter + workflow in English like other skills)

- [ ] **Step 3: Uncomment `menu_import` in catalog**

- [ ] **Step 4: Registry discovery test**

```python
def test_menu_import_skill_registered():
    reg = build_skill_registry()
    assert "menu_import" in reg.skill_ids()
    assert any(t.name.endswith("start_menu_import_session") for t in reg.tools_for(["menu_import"]))
```

Run: `pytest backend/tests/modules/test_menu_import_tools.py -v`

---

### Task 15: Orchestrator / activity

**Files:**
- Modify: `app/modules/assistant/agent/activity_emit.py` (if phase labels needed)
- Modify: `app/modules/assistant/agent/response_format.py` (runtime hint for menu_import workflow)

- [ ] **Step 1: Add plan step labels for import phases**

- [ ] **Step 2: Add runtime section bullet in `build_agent_runtime_section` when `menu_import` entitled**

---

### Task 16: Frontend upload wiring

**Files:**
- Create: `frontend/src/lib/api/assistantImport.ts`
- Modify: `frontend/src/lib/api/assistant.ts` (extend chat request type)
- Modify: `frontend/src/components/assistant/AssistantChatPanel.tsx`

- [ ] **Step 1: `uploadImportAsset(token, restaurantId, file, kind)`**

- [ ] **Step 2: In `sendMessage`, upload pending attachments in parallel before stream**

- [ ] **Step 3: Pass `attachments: ChatAttachmentRef[]` in chat POST body**

- [ ] **Step 4: Infer kind: image → `product_photo` during import flow or let user context decide**

Default: documents → `menu_source`; images in photo collection phase → `product_photo` (agent instructs in SKILL; frontend can use `menu_source` for generic upload v1 and agent re-registers via tool).

Simpler v1: all uploads use `kind` query param from UI — add toggle or detect MIME (PDF/DOCX → menu_source, jpeg/png → product_photo when session active). For v1: **two buttons hidden** — auto-detect by MIME in `uploadImportAsset`.

- [ ] **Step 5: Manual smoke test in dev**

---

### Task 17: End-to-end stub test

**Files:**
- Create: `backend/tests/modules/test_menu_import_e2e_stub.py`

- [ ] **Step 1: Full flow with stub vision/LLM**

1. start session  
2. register source  
3. extract batch  
4. apply batch (confirmed)  
5. register photo + match  
6. apply mappings  

Run: `pytest backend/tests/modules/test_menu_import_e2e_stub.py -v`

---

### Task 18: Documentation

**Files:**
- Create: `backend/docs/menu-import-onboarding.md`

- [ ] **Step 1: Owner-facing flow summary in Spanish**

- [ ] **Step 2: Dev setup: sync themes, env vars, restart backend**

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Upload PDF/DOCX/image | 4, 6, 16 |
| OCR gpt-5.4-nano | 7 |
| open_questions / clarify | 7, 14 |
| Collect photos | 4, 10, 16 |
| Theme selection | 2, 12 |
| Batch apply menu | 8, 9, 14 |
| Promos | 9 |
| Photo match uncertain | 10 |
| Description/image enhance | 11, 14 (+ menu_media) |
| menu_markdown | 13 |
| Tool limit 32 | 1 |
| DB session | 3 |
| Entitlements | 14 |

No TBD placeholders in task steps.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-menu-import-onboarding.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
