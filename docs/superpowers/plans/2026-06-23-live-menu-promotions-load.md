# Live Menu Progressive Load + Promotions Batch — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development.

**Goal:** Menú live sin bloqueo por promos/schedules; promociones sin N+1 en listado.

**Spec:** `docs/superpowers/specs/2026-06-23-live-menu-promotions-load-design.md`

---

### Task 1: Batch promotion junction loads

**Files:**
- Modify: `backend/app/modules/promotions/adapters.py`
- Test: `backend/tests/modules/test_promotions_repo.py`

- [ ] Add `_product_ids_by_promotion_batch`, `_category_ids_by_promotion_batch`, `_option_item_ids_by_promotion_batch`
- [ ] Add `_to_dtos_batch(self, objs: list[Promotion])`
- [ ] Change `list_active` to use `_to_dtos_batch(rows)`

### Task 2: Query count test

- [ ] Add `test_list_active_bounded_query_count` (10 promos, ≤8 queries)

### Task 3: Frontend progressive load

**Files:**
- Modify: `frontend/src/components/pages/PublicDigitalMenuPage.tsx`

- [ ] Split `load()` into critical (restaurant+menu) and secondary (schedules+promotions)
- [ ] `setLoading(false)` after critical path only

### Task 4: Verify

- [ ] `pytest tests/modules/test_promotions_repo.py tests/modules/test_menu_repo.py -v`
