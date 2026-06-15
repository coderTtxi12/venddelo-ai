# Vendelo AI — Frontend (Next.js)

New product UI for restaurant onboarding, dashboard, and public digital menu.

## Setup

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# Point NEXT_PUBLIC_API_URL to FastAPI (default http://localhost:8000/api/v1)

pnpm install
pnpm dev
```

## Scripts

- `pnpm dev` — development server (port 3000)
- `pnpm build` — production build
- `pnpm typecheck` — TypeScript
- `pnpm test` — Vitest unit tests
- `pnpm lint` — ESLint

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing |
| `/login` | Google OAuth via Supabase |
| `/onboarding` | Typeform-style setup wizard |
| `/dashboard/[id]/menu` | Menu editor + AI undo |
| `/dashboard/[id]/orders` | Orders (polling) |
| `/dashboard/[id]/settings` | Publish + QR |
| `/menu/[subdomain]` | Public diner menu |

## Backend

Requires Phase 4–6 API + CORS (`CORS_ORIGINS=http://localhost:3000`).
