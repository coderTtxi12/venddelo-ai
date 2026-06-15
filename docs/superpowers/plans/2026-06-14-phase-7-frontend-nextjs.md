# Phase 7 — Frontend (Next.js) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans per slice.

**Goal:** Ship the new Next.js product (`frontend/`) connected to FastAPI: auth, onboarding, dashboard, public menu, WhatsApp checkout.

**Architecture:** App Router + TanStack Query + Supabase SSR auth; typed `lib/api` client; slices 7a→7d.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, shadcn/ui, TanStack Query, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-phase-7-frontend-nextjs-design.md`

---

## Slice 7a — Foundation

- [ ] Backend: `whatsapp_phone` migration `0004`, schemas, CORS middleware
- [ ] `pnpm create next-app` in `frontend/` (App Router, TS, Tailwind, src/)
- [ ] `lib/api/client.ts`, `types.ts`, module wrappers
- [ ] Supabase `lib/auth/` + middleware protected routes
- [ ] Pages: `/`, `/login`, `/dashboard/[restaurantId]` shell
- [ ] Vitest: API client error parsing test

## Slice 7b — Onboarding + AI

- [ ] Wizard steps component + zod schemas
- [ ] Restaurant create/patch, schedules, payment methods
- [ ] Logo + menu upload; extract job + processing poll page
- [ ] Chain optimize + pick-palette jobs

## Slice 7c — Dashboard

- [ ] Menu editor: categories + products CRUD
- [ ] Option groups UI; promotions list/create
- [ ] AI artifacts list + revert
- [ ] Orders page with polling

## Slice 7d — Publish + Public

- [ ] Settings: subdomain, publish, QR
- [ ] `/menu/[subdomain]` public UI + cart (Zustand)
- [ ] Checkout + order POST + WhatsApp formatter
- [ ] Palette theming on public menu

## Verification

```bash
cd backend && pytest -q && mypy app
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```
