# Tracking State Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first preview page for the accepted, cooking, and searching tracking animations.

**Architecture:** A typed data module defines the sample states. A client showcase component renders one inline-SVG animation component per state using Motion, while a route exposes the gallery without modifying production tracking behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Motion for React, Node test runner.

## Global Constraints

- Preview route is `/rastreo/muestras`.
- Production `/rastreo/[token]` behavior stays unchanged.
- Use the existing public tracking colors and typography.
- Support `prefers-reduced-motion`.
- Start with a single-column mobile layout.

---

### Task 1: Typed sample definitions

**Files:**
- Create: `frontend/src/lib/dispatch/trackingAnimationSamples.ts`
- Test: `frontend/src/lib/dispatch/trackingAnimationSamples.test.ts`

**Interfaces:**
- Produces: `TrackingAnimationState` and `TRACKING_ANIMATION_SAMPLES`.

- [ ] Write a test asserting the exact order `accepted`, `scheduled`, `searching` and customer-facing copy.
- [ ] Run the test and confirm it fails because the module does not exist.
- [ ] Implement the typed sample array.
- [ ] Run the test and confirm it passes.

### Task 2: Animation components and styles

**Files:**
- Create: `frontend/src/components/delivery/TrackingStateAnimation.tsx`
- Create: `frontend/src/components/delivery/TrackingAnimationShowcase.tsx`
- Create: `frontend/src/components/delivery/TrackingAnimationShowcase.module.css`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

**Interfaces:**
- Consumes: `TrackingAnimationState` and `TRACKING_ANIMATION_SAMPLES`.
- Produces: `TrackingStateAnimation({ state, playing })` and `TrackingAnimationShowcase()`.

- [ ] Install `motion`.
- [ ] Implement decorative inline SVG scenes for all three states.
- [ ] Add the shared play/pause control and reduced-motion handling.
- [ ] Add mobile-first responsive styles and 44px controls.
- [ ] Run ESLint on the new component files.

### Task 3: Web preview route

**Files:**
- Create: `frontend/src/app/rastreo/muestras/page.tsx`

**Interfaces:**
- Consumes: `TrackingAnimationShowcase`.
- Produces: the `/rastreo/muestras` page and metadata.

- [ ] Add the static preview route.
- [ ] Run the focused unit test and frontend type/build checks.
- [ ] Open the route in the browser at mobile and desktop viewport sizes.
- [ ] Confirm no horizontal overflow, copy is readable, and controls work.
