# Phase 7 — Frontend (Next.js NEW product) — Design

> Status: **approved** (implementing). Implements Phase 7 of `docs/PROJECT_PLANNING.en.md`.
> Product context: `docs/PROJECT_CONTEXT.en.md`. Architecture: `docs/TECH_ARCHITECTURE.en.md`.
> Backend contracts: FastAPI `/api/v1` (Phases 4–6 complete).

## 1. Goal

Build the **new Vendelo AI web product** in `frontend/` (Next.js + TypeScript), replacing Firebase/Firestore with our **FastAPI backend**. Reuse **UX patterns and catalog logic** from `frontend-legacy/` (categories, products, option groups single/multi, approval/publish) but not its Firebase stack.

End-to-end MVP in staging:

1. Restaurant signs in (Google via Supabase Auth) → onboarding → AI processes menu → reviews in dashboard → publishes subdomain.
2. Diner opens public menu → device locale translation → cart → order via API → **WhatsApp handoff** with formatted message.

## 2. Scope decomposition (within Phase 7)

Phase 7 is large; deliver in **four incremental slices** (each shippable, each with tests):

| Slice | Name | Outcome |
|-------|------|---------|
| **7a** | Foundation | Next.js app, design system, typed API client, Supabase auth, protected routes |
| **7b** | Onboarding + AI | Typeform-style wizard, file uploads, job polling, processing screen |
| **7c** | Dashboard | Menu editor (CRUD + options + promotions), AI undo, orders list (polling), basic stats |
| **7d** | Publish + Public menu | Subdomain publish, QR/link, public ordering UI, WhatsApp checkout |

**Out of scope for Phase 7** (deferred to Phase 8):

- WebSockets / Supabase Realtime for live orders and AI push (use **polling** in 7b/7c).
- Dedicated statistics/earnings API (derive **client-side aggregates** from orders in 7c).
- Wildcard DNS + TLS on production domain (document strategy; dev uses path-based routing).
- Online card payments.

## 3. Key decisions

### 3.1 Framework & tooling

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Framework | **Next.js 15 App Router** + TypeScript strict | Per planning + TECH_ARCHITECTURE |
| Styling | **Tailwind CSS 4** + **shadcn/ui** | Modern Next ecosystem; legacy MUI not ported |
| Server state | **TanStack Query v5** | Cache, retries, polling for jobs/orders |
| Client UI state | **Zustand** (cart, onboarding draft) | Simple, no boilerplate |
| Forms | **react-hook-form** + **zod** | Onboarding + editor validation |
| API types | Hand-written TS types mirroring Pydantic DTOs (MVP); OpenAPI codegen later | Matches backend now; avoids codegen setup delay |
| i18n (UI chrome) | **next-intl** for dashboard/onboarding labels; public menu locale from `navigator.language` → API `?locale=` | Separates UI strings from menu translation (backend AI) |
| QR | **qrcode** npm package | Generate publish QR client-side from public URL |
| Maps | **@react-google-maps/api** or Places Autocomplete widget | Onboarding location step |

### 3.2 Auth

- **Supabase Auth** (`@supabase/supabase-js` + `@supabase/ssr`) with **Google OAuth**.
- On sign-in, attach `Authorization: Bearer <access_token>` to all `/api/v1` calls.
- Backend already verifies JWT via `SUPABASE_JWT_SECRET` (HS256).
- Middleware in Next.js:
  - `/dashboard/*`, `/onboarding/*` → require session.
  - `/menu/*` (public) → no auth.
- **Restaurant context**: after login, `GET /restaurants` → if one restaurant, auto-select; if many, picker; store `restaurantId` in cookie or URL segment `/dashboard/[restaurantId]`.

### 3.3 API client layer

```
frontend/src/lib/api/
  client.ts       # fetch wrapper, base URL, auth header, error parsing
  types.ts        # DTOs (Restaurant, Product, Order, AIJob, ...)
  restaurants.ts  # module-specific functions
  menu.ts
  orders.ts
  promotions.ts
  ai.ts
  public.ts       # unauthenticated public menu + order
```

- Base URL: `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000/api/v1`).
- Uniform error shape from backend → `ApiError { code, message, httpStatus }`.
- Idempotency: public order POST sends `Idempotency-Key` (UUID per checkout attempt).
- Cursor pagination: expose `next_cursor` helpers for infinite scroll in editor lists.

### 3.4 Routing & public menu hosting

**Development / staging:**

```
/                          → marketing landing (minimal) or redirect to login
/login                     → Google sign-in
/onboarding                → wizard (new restaurant)
/onboarding/processing     → AI job polling
/dashboard/[rid]           → shell + sidebar
/dashboard/[rid]/menu      → categories + products editor
/dashboard/[rid]/promotions
/dashboard/[rid]/orders
/dashboard/[rid]/settings  → publish, subdomain, QR
/menu/[subdomain]          → public diner menu (path-based; no wildcard DNS needed locally)
```

**Production (later, Phase 10):** Next.js middleware maps `*.vendelo.app` host → rewrite to `/menu/[subdomain]`. Spec documents hook; implementation in 7d leaves middleware stub commented.

### 3.5 Palettes & theming

- Backend palettes: `sunset | ocean | forest | classic | midnight`.
- Map each to CSS variable set in `frontend/src/styles/palettes.ts`.
- Public menu + dashboard apply `restaurant.color_palette` as `data-palette` on root element.
- AI `pick-palette` job runs during onboarding after logo upload.

### 3.6 Onboarding wizard (Typeform-style)

Single question per screen, progress bar, back/next. Steps:

1. **Restaurant name** → `POST /restaurants` (draft, temporary subdomain auto-generated e.g. `draft-{shortId}`).
2. **Location** → Google Places autocomplete → `PATCH /restaurants/{id}` with `address`, `latitude`, `longitude`, `place_id`.
3. **Schedule** → takeout days/hours; toggle "same for delivery" → `PUT /restaurants/{id}/schedules`.
4. **Payment methods** → checkboxes (all on by default) per takeout/delivery → `PUT /restaurants/{id}/payment-methods`.
5. **Logo upload** → upload to Supabase Storage via **signed URL or direct client upload** (TBD: if backend lacks upload URL endpoint, MVP uploads via Supabase client with service bucket policy for authenticated user path `restaurants/{rid}/logo.*`); store `logo_path` on restaurant.
6. **Menu onboarding** → agentic assistant (`menu_import` skill) in dashboard chat — upload photos/PDF, guided discovery, batch extraction via `LLMProviderPort` (replaces legacy `POST ai/jobs/extract-menu`).
7. **Processing UX** → SSE agent progress (`agent.phase`, `tool.start/result`); preview + confirm before apply (no `ai/jobs` polling).
8. **Review CTA** → navigate to dashboard menu editor.

Draft state persisted in `localStorage` + server (restaurant record) so refresh is safe.

### 3.7 Dashboard — menu editor

Port behavioral rules from `frontend-legacy/src/pages/ProductsPage.tsx` and `supplierCatalogTypes.ts`:

- **Categories**: CRUD, sort_index, soft delete, image.
- **Products**: CRUD, price in cents display, ≥1 category, approval_status workflow (`draft` → `pending` → `approved` → publish).
- **Option groups**: single/multi, required, min/max, items with `price_delta_cents`.
- **Promotions**: CRUD via `/promotions` endpoints (new vs legacy).
- **AI undo**: list `GET .../ai/artifacts`, revert per row `POST .../revert`; show badge on fields with active AI optimization.
- List views: cursor pagination + search/filter client-side on loaded page (MVP).

Layout: sidebar (Menu, Promotions, Orders, Settings), top bar with restaurant name + publish status.

### 3.8 Orders & statistics (polling MVP)

- **Orders page**: poll `GET /restaurants/{rid}/orders?status=pending` every 10s; manual refresh button.
- Status actions: `POST .../orders/{id}/status` (confirm → preparing → ready → delivered).
- **Statistics (basic)**: compute from fetched orders — count today, sum `total_cents`, simple chart (orders by day last 7 days) client-side. No new backend endpoints in Phase 7.

### 3.9 Publish flow

Settings page:

1. Subdomain input (validate uniqueness via attempt `PATCH` or dedicated check — MVP: PATCH and show error).
2. `PATCH /restaurants/{id}` → `status: published`, `subdomain`.
3. Show public URL: `{NEXT_PUBLIC_APP_URL}/menu/{subdomain}` (dev) or `https://{subdomain}.vendelo.app` (prod).
4. QR code download (PNG).
5. Require ≥1 published approved product before publish (client validation + backend error surfacing).

### 3.10 Public menu (diner)

- `GET /public/menu/{subdomain}?locale={deviceLocale}` on load.
- Device locale: `navigator.language` normalized (`es`, `en`, …) — backend falls back per Phase 6.
- UI: category tabs/sections, product cards, product detail modal with option groups (enforce single/multi selection rules), add to cart.
- **Cart** (Zustand): line items with selected options, quantity, line total.
- Checkout sheet: customer name, phone, order type (takeout/delivery), delivery address if delivery, payment method (filtered by restaurant config + order type).
- Submit: `POST /public/menu/{subdomain}/orders` with `Idempotency-Key`.
- On success → **WhatsApp handoff**:
  - `NEXT_PUBLIC_WHATSAPP_ENABLED=true`
  - Format order detail string (products, options, totals, address, payment) — port style from legacy/OlaClick reference.
  - Open `https://wa.me/{restaurantPhone}?text={encoded}` (phone from restaurant settings — **requires** `whatsapp_phone` field).

**Gap — backend:** `RestaurantDTO` has no `whatsapp_phone` today. Phase 7 adds optional migration `0004_add_whatsapp_phone` + `RestaurantUpdate.whatsapp_phone` (string, E.164 or local). Onboarding step or settings collects it.

### 3.11 File uploads (logo / product images)

**Approach A (recommended MVP):** Supabase Storage **direct client upload** using anon key + RLS policies for `restaurants/{owner_id}/*` paths; then PATCH `logo_path` / `image_path` on entities.

**Approach B:** Backend signed-upload endpoint (new) — defer unless RLS is blocked.

Product images in editor: upload on save → store path → display via Supabase public URL helper in `lib/storage.ts`.

## 4. Repository layout

```
frontend/
  package.json
  next.config.ts
  tailwind.config.ts
  .env.example
  src/
    app/
      (auth)/login/page.tsx
      onboarding/page.tsx
      onboarding/processing/page.tsx
      dashboard/[restaurantId]/layout.tsx
      dashboard/[restaurantId]/menu/page.tsx
      dashboard/[restaurantId]/promotions/page.tsx
      dashboard/[restaurantId]/orders/page.tsx
      dashboard/[restaurantId]/settings/page.tsx
      menu/[subdomain]/page.tsx
      layout.tsx
    components/
      ui/              # shadcn
      onboarding/
      menu-editor/
      public-menu/
      orders/
    lib/
      api/
      auth/
      storage.ts
      whatsapp.ts
      palettes.ts
    hooks/
    stores/
      cart.ts
      restaurant.ts
    styles/
  tests/               # Vitest + Testing Library
```

Monorepo root: add `frontend/` alongside `frontend-legacy/` (unchanged).

## 5. Environment variables

```bash
# .env.example
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_WHATSAPP_ENABLED=true
```

## 6. Backend additions (minimal, part of Phase 7)

| Change | Reason |
|--------|--------|
| `restaurants.whatsapp_phone` nullable string + migration `0004` | WhatsApp order handoff |
| CORS: allow `http://localhost:3000` in dev | Next.js dev server |
| Optional: `GET /restaurants/check-subdomain?subdomain=` | Publish UX (can defer; use PATCH error) |

No other backend changes required for MVP; all catalog/AI/order endpoints exist.

## 7. Testing strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest | API client error parsing, cart totals, option validation, WhatsApp formatter, palette CSS mapping |
| Component | Testing Library | Onboarding step navigation, product form validation, public menu add-to-cart |
| E2E (optional slice 7d) | Playwright | Login mock → onboarding → publish → public order (against local API + test DB) |

CI (frontend): `lint` (eslint) → `typecheck` (tsc) → `test` (vitest). Wired in Phase 10; local gates in Phase 7 DoD.

## 8. Legacy porting map

| Legacy (`frontend-legacy`) | New (`frontend`) |
|----------------------------|------------------|
| `supplierCatalogTypes.ts` | `lib/api/types.ts` + zod schemas |
| `ProductsPage.tsx` UX | `components/menu-editor/*` (simplified first pass) |
| `CategoriesPage.tsx` | `dashboard/.../menu` categories tab |
| `useAuth` + Firebase | Supabase SSR session + `lib/auth` |
| `services/db/*` | `lib/api/*` |
| MUI components | shadcn/ui equivalents |
| Firestore pagination | Cursor pagination from API |

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Supabase Storage RLS blocks uploads | Document bucket policy; fallback backend upload endpoint |
| AI jobs slow; user leaves processing page | Persist `job_id` on restaurant or localStorage; resume polling on return |
| No realtime orders | Clear "auto-refreshes every 10s" UX; Phase 8 WebSockets |
| Subdomain routing locally | Path-based `/menu/[subdomain]` always works |
| Translation latency first visit | Loading skeleton; backend Redis cache warms on repeat |

## 10. Definition of Done (Phase 7)

- [ ] `frontend/` Next.js app runs (`pnpm dev`) against local FastAPI.
- [ ] Google login → JWT on API calls → tenant-scoped dashboard.
- [ ] Full onboarding → extract job → dashboard with generated menu.
- [ ] Menu editor CRUD (categories, products, options, promotions) + AI undo.
- [ ] Publish subdomain + QR + public menu link.
- [ ] Public menu: locale-aware, cart, order POST, WhatsApp message.
- [ ] Vitest unit tests for core libs; eslint + tsc green.
- [ ] `frontend/.env.example` documented; README section in `frontend/README.md`.
- [ ] Implementation plan in `docs/superpowers/plans/2026-06-14-phase-7-frontend-nextjs.md`.
- [ ] Commit list for user (no agent commits).

## 11. Approaches considered

### A — Big-bang single PR (rejected)

All surfaces at once. High risk, hard review. Rejected in favor of slices 7a–7d.

### B — Next.js + Tailwind + shadcn + TanStack Query (recommended)

Modern stack aligned with TECH_ARCHITECTURE. Clean separation UI / hooks / API. Matches how greenfield Next apps are built in 2026.

### C — Port legacy Vite app incrementally (rejected)

Keep Vite, swap Firebase for fetch. Faster short-term but conflicts with planning ("Next.js NEW product") and loses SSR for public menu SEO/subdomain middleware.

**Recommendation:** **B**, delivered as slices **7a → 7b → 7c → 7d**.
