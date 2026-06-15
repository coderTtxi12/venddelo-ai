# Phase 4 — Core Domain Services & API v1 (catalog/menu) — Design

> Status: approved (design decisions confirmed). Implements Phase 4 of `docs/PROJECT_PLANNING.en.md`.
> Builds on Phase 3 (repository ports + SQLAlchemy adapters + UnitOfWork + StoragePort).

## 1. Goal

Expose the catalog/menu domain over a versioned HTTP API (`/api/v1`) backed by a thin
**service layer** that holds business rules and depends only on **repository ports** (Phase 3).
Add **authentication** (Supabase JWT) + **per-tenant authorization** (restaurant ownership),
a uniform **domain-error** model, **idempotent** public order creation, cursor **pagination**,
and OpenAPI docs. Each request runs inside one **UnitOfWork** (one session, commit on success).

## 2. Confirmed decisions

- **Tenancy:** add `owner_id` (Supabase auth user UUID) to `restaurants` via a new Alembic
  migration. One owner per restaurant for MVP. Authz = `restaurant.owner_id == current_user.id`.
- **Auth:** verify the Supabase access token as **HS256 JWT** using the project JWT secret
  (`SUPABASE_JWT_SECRET` from settings). No network call. Wrapped behind an `AuthPort` so the
  mechanism is swappable and testable.
- **Public menu read:** include `GET /api/v1/public/menu/{subdomain}` now (basic, no cache, no
  translation — uses `MenuRepository.get_full_menu`).
- **Rate limiting:** deferred to Phase 5 (Redis). No rate limiter built here.
- **Idempotency:** public order creation uses the DB `IdempotencyRepository` (Phase 3) keyed by
  the `Idempotency-Key` header + request hash. Redis hot path is Phase 5.

## 3. Architecture

Per-module layering (modular monolith, microservices-ready):

```
api (FastAPI router, thin)  ->  service (domain rules)  ->  repository port  ->  adapter (Phase 3)
```

- **Service** classes receive the specific repository **port(s)** they need (constructor
  injection). They never import SQLAlchemy/Supabase. They raise **domain errors**.
- **UnitOfWork** is created per request by a FastAPI dependency; the endpoint builds the
  service from `uow.<repo>`, calls it, and the dependency commits on success / rolls back on error.
- **Auth** + **ownership** are enforced by FastAPI dependencies before the endpoint body runs.
- **Errors**: services raise `DomainError` subclasses; a registered handler maps them to the
  existing uniform error body (`{"error": {code, message, request_id}}`).

## 4. File structure

```
backend/app/
  core/
    config.py                 # (modify) add supabase_jwt_secret, jwt_audience, order_idempotency_ttl
    exceptions.py             # (new) DomainError + NotFoundError/ConflictError/ValidationError/ForbiddenError/UnauthorizedError
    errors.py                 # (modify) register domain-error handler -> uniform body
    security.py               # (new) AuthenticatedUser, AuthPort (ABC)
  infra/
    auth/
      __init__.py
      supabase_jwt.py         # (new) SupabaseJwtAuth(AuthPort) — HS256 verify
  api/
    deps.py                   # (new) get_uow, get_auth, get_current_user, require_owned_restaurant, pagination_params
    v1/
      router.py               # (modify) include all module routers
  modules/
    restaurants/
      service.py              # (new) RestaurantService
      api.py                  # (new) router: create/get/list-mine/update/delete + schedules + payment-methods
    menu/
      service.py              # (new) MenuService (categories + products + option groups/items + full menu)
      api.py                  # (new) routers for categories, products, option-groups
    promotions/
      service.py              # (new) PromotionService
      api.py                  # (new) router
    orders/
      service.py              # (new) OrderService (admin list/get/status + public idempotent create)
      api.py                  # (new) admin router (tenant-scoped)
    public/
      __init__.py             # (new) public, unauthenticated surface
      api.py                  # (new) GET public menu by subdomain + POST public order
  db/
    models/restaurant.py      # (modify) add owner_id column
  migrations/versions/
    0002_*.py                 # (new) add restaurants.owner_id (+ index)
```

> Services live next to their existing `repository.py`/`adapters.py`/`schemas.py` per module.
> A new `public` module hosts the unauthenticated surface (menu read + order create) so auth
> boundaries are obvious.

## 5. Auth & authorization

- `AuthenticatedUser` (Pydantic): `id: UUID` (from `sub`), `email: str | None`, `role: str | None`.
- `AuthPort(ABC)`: `verify_token(token: str) -> AuthenticatedUser`. Raises `UnauthorizedError`.
- `SupabaseJwtAuth(AuthPort)`: decodes HS256 with `settings.supabase_jwt_secret`,
  `audience="authenticated"`, validates `exp`; maps `sub`→`id`. Uses `pyjwt`.
- Dependencies (`api/deps.py`):
  - `get_auth() -> AuthPort` (singleton `SupabaseJwtAuth`).
  - `get_current_user(authorization: Header, auth=Depends(get_auth)) -> AuthenticatedUser`:
    parses `Authorization: Bearer <token>`; raises `UnauthorizedError` if missing/invalid.
  - `require_owned_restaurant(restaurant_id, user=Depends(get_current_user), uow=Depends(get_uow))`:
    loads restaurant; `NotFoundError` if absent, `ForbiddenError` if `owner_id != user.id`;
    returns the `RestaurantDTO`.
- New dependency: `pyjwt==2.10.1` in `requirements.txt`.
- New settings: `supabase_jwt_secret: str | None`, `jwt_audience: str = "authenticated"`,
  `order_idempotency_ttl_seconds: int = 86400`.

## 6. Domain errors (`core/exceptions.py`) + handler

| Exception | HTTP | code |
|-----------|------|------|
| `UnauthorizedError` | 401 | `unauthorized` |
| `ForbiddenError` | 403 | `forbidden` |
| `NotFoundError` | 404 | `not_found` |
| `ConflictError` | 409 | `conflict` |
| `ValidationError` (domain) | 400 | `validation_error` |

`register_exception_handlers` adds a handler for `DomainError` that reads `.http_status`/`.code`
/`.message` and returns the uniform body. Existing HTTP/validation/unhandled handlers stay.

## 7. Services & business rules

**RestaurantService(restaurant_repo)**
- `create(owner_id, data: RestaurantCreate) -> RestaurantDTO`: validate subdomain format
  (`^[a-z0-9](-?[a-z0-9])*$`, len 3–63), 409 if subdomain taken; set `owner_id`.
- `get(id)`, `list_for_owner(owner_id, params)`, `update(id, data)`,
  `delete(id)` (soft), `set_schedules(id, [...])`, `set_payment_methods(id, [...])`.
- Subdomain uniqueness checked via `get_by_subdomain` before insert/update.

**MenuService(menu_repo)** — covers categories, products, option groups/items, full menu.
- Categories: `create/get/list/update/soft_delete` (scoped to `restaurant_id`).
- Products: `create` requires `len(category_ids) >= 1` (`ValidationError` otherwise) and that all
  categories belong to the same restaurant; `update` enforces same rule when `category_ids` set;
  `publish(product_id)` requires `approval_status == "approved"` else `ConflictError`;
  `set_approval(product_id, status)`.
- Option groups: validate `selection in {single, multi}`; `min_selections <= max_selections`
  when `max_selections` set; for `single`, `max_selections in {None, 1}`.
- `get_full_menu(restaurant_id)` passthrough (also used by public via subdomain→id).

**PromotionService(promotion_repo)**
- `create/get/list_active/update/soft_delete`; `set_products`/`set_categories`.
- Validate: `type in {percent, amount, combo, 2x1}`; if `percent`, `1 <= percent <= 100`;
  if `amount`, `amount_cents > 0`; `scope in {product, category, order}`; `starts_at < ends_at`
  when both set.

**OrderService(order_repo, restaurant_repo, idempotency_repo, menu_repo)**
- `list_for_restaurant(restaurant_id, params, status?)`, `get(restaurant_id, order_id)`
  (404 if order not in that restaurant), `update_status(restaurant_id, order_id, status)`
  with allowed transitions (`pending→confirmed→preparing→ready→delivered`, plus `cancelled`).
- Public input uses a dedicated request schema (`PublicOrderInput` with `PublicOrderItemInput`:
  product_id, quantity, selected_options?) — the client never sends totals or restaurant_id;
  the service resolves product prices server-side and builds the internal `OrderCreate`.
- `create_public(subdomain, data, idempotency_key)`:
  1. resolve restaurant by subdomain (404), must be `published`.
  2. validate `payment_method` is enabled for the order `type` (via restaurant payment methods).
  3. recompute totals from items server-side (don't trust client totals) → `ValidationError`
     on mismatch is avoided by recomputing and overwriting.
  4. idempotency: if `idempotency_key` present and a record exists with same request hash →
     return cached snapshot; if same key + different hash → `ConflictError`; else create order,
     store snapshot with TTL.

## 8. API surface (`/api/v1`)

Admin (require `get_current_user`; tenant routes also `require_owned_restaurant`):

```
POST   /restaurants
GET    /restaurants                         # list mine
GET    /restaurants/{rid}
PATCH  /restaurants/{rid}
DELETE /restaurants/{rid}                    # soft delete
PUT    /restaurants/{rid}/schedules
PUT    /restaurants/{rid}/payment-methods

POST   /restaurants/{rid}/categories
GET    /restaurants/{rid}/categories
PATCH  /restaurants/{rid}/categories/{cid}
DELETE /restaurants/{rid}/categories/{cid}

POST   /restaurants/{rid}/products
GET    /restaurants/{rid}/products
GET    /restaurants/{rid}/products/{pid}
PATCH  /restaurants/{rid}/products/{pid}
DELETE /restaurants/{rid}/products/{pid}
POST   /restaurants/{rid}/products/{pid}/approval     # {status}
POST   /restaurants/{rid}/products/{pid}/publish

POST   /restaurants/{rid}/products/{pid}/option-groups
PATCH  /restaurants/{rid}/products/{pid}/option-groups/{gid}
DELETE /restaurants/{rid}/products/{pid}/option-groups/{gid}
POST   /restaurants/{rid}/products/{pid}/option-groups/{gid}/items
DELETE /restaurants/{rid}/products/{pid}/option-groups/{gid}/items/{iid}

POST   /restaurants/{rid}/promotions
GET    /restaurants/{rid}/promotions
PATCH  /restaurants/{rid}/promotions/{prid}
DELETE /restaurants/{rid}/promotions/{prid}
PUT    /restaurants/{rid}/promotions/{prid}/products
PUT    /restaurants/{rid}/promotions/{prid}/categories

GET    /restaurants/{rid}/orders                      # list (status filter, pagination)
GET    /restaurants/{rid}/orders/{oid}
POST   /restaurants/{rid}/orders/{oid}/status         # {status}
```

Public (no auth):

```
GET    /public/menu/{subdomain}                       # FullMenuDTO (published+approved+active)
POST   /public/menu/{subdomain}/orders                # Idempotency-Key header; OrderDTO
```

- List endpoints accept `?limit=&cursor=` → `CursorPage[...]` from Phase 1/3.
- Responses use the Phase 3 DTOs directly as `response_model`.

## 9. Testing strategy

- **Service unit tests** with in-memory fake repos (implement the ports) — pure business rules,
  no DB: subdomain validation/uniqueness, ≥1 category rule, option group min/max,
  publish-requires-approved, promotion ranges, order total recompute, payment-method-enabled,
  status transitions, idempotency replay/conflict.
- **Auth unit tests**: `SupabaseJwtAuth` accepts a valid HS256 token (signed in-test with a
  known secret), rejects expired/invalid signature/missing sub.
- **API integration tests** with FastAPI `TestClient` against the local Docker Postgres
  (`DATABASE_URL_TEST`), overriding `get_auth` with a fake auth that returns a fixed user, and
  seeding an owned restaurant: happy-path CRUD, 401 (no token), 403 (not owner), 404, 409
  (dup subdomain), public menu read shows only published, public order idempotent replay.
- Quality gates unchanged: `pytest`, `ruff`, `black`, `mypy app` all green; `migrations/`
  stays lint-excluded.

## 10. Database change

- New migration `0002_add_owner_id`: add `restaurants.owner_id UUID NULL` + `ix_restaurants_owner_id`.
  Nullable so existing seed rows remain valid; new restaurants always set it. Update the
  `Restaurant` model + `RestaurantDTO` (+ `RestaurantCreate` excludes it; set by service).
- Apply to local Docker (tests) and to Supabase (`alembic upgrade head`).

## 11. Out of scope (later phases)

- Redis cache + rate limiting + Redis-backed idempotency hot path → **Phase 5**.
- AI extraction/optimization/translation; translated public menu → **Phase 6**.
- WhatsApp order handoff, realtime orders, statistics → **Phase 8**.
- Next.js frontend → **Phase 7**. File uploads via StoragePort endpoints → wired when onboarding
  lands (Phase 6/7); StoragePort already exists.

## 12. Definition of Done

- `owner_id` migration applied (local + Supabase); model/DTO updated.
- AuthPort + SupabaseJwtAuth; `get_current_user` + `require_owned_restaurant` deps.
- Domain-error model + handler returning the uniform body.
- Services for restaurants, menu, promotions, orders with the rules in §7.
- Full `/api/v1` admin surface + public menu read + idempotent public order create.
- Service unit tests + auth tests + API integration tests green.
- `pytest` / `ruff` / `black` / `mypy app` all green.
- Commit list provided for the user to run (no commits executed by the agent).
```
