# Multi-Restaurant Admin Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins on multiple restaurants with switcher UI, last-accessed default, and owner-only admin management.

**Architecture:** Drop global unique on `restaurant_members.user_id`, add `last_accessed_at`, new access/list/select/remove APIs, centralize frontend restaurant context with sidebar switcher.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Next.js, React context

**Spec:** `docs/superpowers/specs/2026-07-12-multi-restaurant-admin-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `backend/migrations/versions/0044_multi_restaurant_admin_access.py`
- Modify: `backend/app/db/models/restaurant.py`

- [ ] Drop `uq_restaurant_members_user_id`
- [ ] Add `last_accessed_at` column
- [ ] Add partial unique index for one owner membership per user

### Task 2: Repository + service backend

**Files:**
- Modify: `backend/app/modules/restaurants/repository.py`
- Modify: `backend/app/modules/restaurants/adapters.py`
- Modify: `backend/app/modules/restaurants/schemas.py`
- Modify: `backend/app/modules/restaurants/service.py`
- Modify: `backend/app/modules/restaurants/api.py`
- Modify: `backend/app/api/deps.py` (if needed for restaurant_id param)

- [ ] `list_accessible(user_id)`
- [ ] `get_for_user(user_id, restaurant_id=None)` with default algorithm
- [ ] `touch_last_accessed(user_id, restaurant_id)`
- [ ] `remove_admin_member(restaurant_id, member_id)`
- [ ] Update `claim_admin_invites` for multi-restaurant
- [ ] Update `email_associated_with_other_restaurant` (allow admin elsewhere)
- [ ] Update `user_has_membership` / create guard (owner-only uniqueness)

### Task 3: API tests

**Files:**
- Modify: `backend/tests/api/test_restaurant_admin_invites.py`

- [ ] Multi-restaurant admin access
- [ ] Last-accessed default
- [ ] Remove active admin
- [ ] Owner cannot remove owner

### Task 4: Frontend API + context

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/restaurants.ts`
- Modify: `frontend/src/services/db/supplierResolve.ts`
- Create: `frontend/src/contexts/RestaurantAccessContext.tsx`

- [ ] API client for access list, select, remove member
- [ ] Updated `resolveMyRestaurantAccess`
- [ ] Context with switcher state

### Task 5: UI switcher + settings

**Files:**
- Create: `frontend/src/components/ui/RestaurantSwitcher.tsx`
- Create: `frontend/src/components/ui/RestaurantSwitcher.module.css`
- Modify: `frontend/src/components/ui/Sidebar.tsx`
- Modify: `frontend/src/layouts/MainLayout.tsx`
- Modify: `frontend/src/contexts/RestaurantOrdersContext.tsx`
- Modify: `frontend/src/components/pages/SettingsPage.tsx`

- [ ] Sidebar switcher (ui-ux-pro-max flat minimal)
- [ ] Remove active admin button
- [ ] Orders context respects selected restaurant
