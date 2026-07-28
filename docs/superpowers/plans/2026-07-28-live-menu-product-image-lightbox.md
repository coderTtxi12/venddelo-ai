# Live Menu Product Image Lightbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ver la imagen de producto a pantalla completa con zoom en la vista de detalle del menú live.

**Architecture:** Componente `ProductImageLightbox` con portal y gestos custom; utilidades puras de zoom en `productImageZoom.ts`; prop `enableImageLightbox` en `DigitalMenuProductDetail` activada solo desde `PublicDigitalMenuPage`.

**Tech Stack:** React 19, Next.js 16, CSS modules, MUI icons, `createPortal`.

## Global Constraints

- Solo menú live; no editor preview
- Sin dependencias nuevas
- Zoom 1×–4×; doble toque alterna 1× ↔ 2.5×
- Cerrar con X, Escape; backdrop solo si zoom === 1
- `prefers-reduced-motion` respetado
- Accesibilidad: `aria-label`, foco al abrir/cerrar

---

### Task 1: Zoom utilities + tests

**Files:**
- Create: `frontend/src/lib/digital-menu/productImageZoom.ts`
- Create: `frontend/src/lib/digital-menu/productImageZoom.test.ts`

- [x] Implement clamp, zoomAtPoint, toggleDoubleTapZoom
- [x] Run `node --import tsx --test src/lib/digital-menu/productImageZoom.test.ts`

### Task 2: ProductImageLightbox component

**Files:**
- Create: `frontend/src/components/digital-menu/ProductImageLightbox.tsx`
- Create: `frontend/src/components/digital-menu/ProductImageLightbox.module.css`

- [x] Portal, overlay, close, pinch, pan, wheel, double-tap

### Task 3: Wire into product detail (live only)

**Files:**
- Modify: `frontend/src/components/digital-menu/DigitalMenuProductDetail.tsx`
- Modify: `frontend/src/components/digital-menu/DigitalMenuProductDetail.module.css`
- Modify: `frontend/src/components/pages/PublicDigitalMenuPage.tsx`

- [x] Add `enableImageLightbox` prop and hero trigger button
- [x] Pass prop from `PublicDigitalMenuPage` only
