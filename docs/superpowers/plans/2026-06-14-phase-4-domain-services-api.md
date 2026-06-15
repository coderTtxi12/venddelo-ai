# Phase 4 — Core Domain Services & API v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task.

**Goal:** HTTP API `/api/v1` with service layer, Supabase JWT auth, tenant ownership, domain errors, and public menu/order endpoints.

**Architecture:** `api → service → repository port`; one UnitOfWork per request; DomainError → uniform JSON body.

**Tech Stack:** FastAPI, Pydantic v2, PyJWT, SQLAlchemy 2.0, pytest, TestClient.

---

## Task 1: owner_id migration + model/DTO/repo

**Files:** `db/models/restaurant.py`, `modules/restaurants/schemas.py`, `repository.py`, `adapters.py`, `migrations/versions/0002_add_owner_id.py`

- Add `owner_id` column (nullable UUID) + index to `Restaurant` model and `RestaurantDTO`.
- Extend `RestaurantRepository.add(..., owner_id=)`, `list_for_owner(owner_id, params)`, `list_payment_methods(restaurant_id)`.
- Generate migration `0002_add_owner_id`.

## Task 2: Domain exceptions + error handler

**Files:** `core/exceptions.py`, `core/errors.py`

- `DomainError` base + subclasses; register handler returning uniform body.

## Task 3: Auth port + Supabase JWT

**Files:** `core/security.py`, `infra/auth/supabase_jwt.py`, `core/config.py`, `requirements.txt`, `.env.example`

- `AuthPort`, `AuthenticatedUser`, `SupabaseJwtAuth` (HS256 + `SUPABASE_JWT_SECRET`).
- Add `pyjwt==2.10.1`.

## Task 4: API dependencies

**Files:** `api/deps.py`

- `get_auth`, `get_current_user`, `require_owned_restaurant`, `pagination_params`.

## Task 5: RestaurantService + API

**Files:** `modules/restaurants/service.py`, `modules/restaurants/api.py`

## Task 6: MenuService + API

**Files:** `modules/menu/service.py`, `modules/menu/api.py`

## Task 7: PromotionService + API

**Files:** `modules/promotions/service.py`, `modules/promotions/api.py`

## Task 8: OrderService + admin API + public API

**Files:** `modules/orders/service.py`, `modules/orders/schemas.py` (PublicOrderInput), `modules/orders/api.py`, `modules/public/api.py`

## Task 9: Wire v1 router

**Files:** `api/v1/router.py`

## Task 10: Tests + quality gates

**Files:** service unit tests, auth tests, API integration tests (`tests/api/`, `tests/services/`)

## Task 11: Apply migration (local + Supabase) + final verification

Run: `alembic upgrade head`, `pytest`, `ruff`, `black`, `mypy app`.

---

## Commit list (user executes manually)

See end of implementation session.
