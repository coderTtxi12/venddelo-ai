# Live menu mobile browser chrome collapse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public live menu scroll on the document on mobile so iOS/Android browser chrome can auto-hide.

**Architecture:** Unlock the public mobile CSS shell so content grows the document; introduce a `document` scroll-root mode in category-scroll helpers and wire `PublicDigitalMenuPage` (mobile only) to `window` scroll APIs and `IntersectionObserver` with `root: null`. Desktop public layout and editor preview keep nested scroll.

**Tech Stack:** Next.js frontend, CSS modules, `node:test` unit tests.

**Spec:** `docs/superpowers/specs/2026-09-08-live-menu-mobile-browser-chrome-collapse-design.es.md`

## Global Constraints

- Scope: public live menu **mobile only** (tablet that shares the mobile shell included)
- Out of scope: desktop public menu, `DigitalMenuEditorPreview`, restaurant dashboard, delivery dashboard
- Work on the **current git branch**; **do not create a new branch**; **do not commit** unless the user explicitly asks
- Keep cart / search / checkout overlays on their own nested scroll
- Scope CSS overrides to `.publicRoot` / `.mobileFrame` so the editor `.phone` mock stays nested

## File map

| File | Role |
|------|------|
| `frontend/src/lib/digital-menu/categoryScrollSpy.ts` | Document vs element scroll math + scroll helpers |
| `frontend/src/lib/digital-menu/categoryScrollSpy.test.ts` | Unit tests for those helpers |
| `frontend/src/lib/digital-menu/useCategoryScrollSpy.ts` | Attach scroll listener to `window` or element |
| `frontend/src/components/pages/PublicDigitalMenuPage.tsx` | Mobile uses document scroll mode |
| `frontend/src/components/pages/PublicDigitalMenuPage.module.css` | Unlock `.mobileFrame` height lock |
| `frontend/src/components/pages/DigitalMenuPage.module.css` | Unlock `.publicRoot` / `.phoneScroll`; sticky compact header |
| `frontend/src/components/digital-menu/DigitalMenuProductDetail.tsx` | Hero IO uses `root: null` when document mode |
| `frontend/src/components/digital-menu/PromotionShortcutProductsView.tsx` | Same hero IO fix |

---

### Task 1: Scroll-root helpers + tests (TDD)

**Files:**
- Create: `frontend/src/lib/digital-menu/categoryScrollSpy.test.ts`
- Modify: `frontend/src/lib/digital-menu/categoryScrollSpy.ts`

**Interfaces:**
- Produces:
  - `DOCUMENT_SCROLL_ROOT = 'document' as const`
  - `type MenuScrollRoot = HTMLElement | typeof DOCUMENT_SCROLL_ROOT`
  - `getScrollPosition(root: MenuScrollRoot): number`
  - `scrollMenuTo(root: MenuScrollRoot, options: ScrollToOptions): void`
  - `getObserverRoot(root: MenuScrollRoot): Element | null` — `null` for document mode (viewport)
  - `getSectionOffsetTop(section, root: MenuScrollRoot): number` — document: `rect.top + window.scrollY`
  - `getCategoryScrollAnchorPosition(root: MenuScrollRoot, options): number` — document + categoryBar: `window.scrollY + barRect.bottom + extra`
  - Existing `resolveActiveCategoryId` / `scrollCategoryTabIntoView` keep working with `MenuScrollRoot` where they take a root

**Consumes:** none

- [ ] **Step 1: Write the failing test file**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOCUMENT_SCROLL_ROOT,
  getCategoryScrollAnchorPosition,
  getObserverRoot,
  getScrollPosition,
  getSectionOffsetTop,
  resolveActiveCategoryId,
  scrollMenuTo,
} from './categoryScrollSpy.ts';

type Rect = { top: number; bottom: number };

function fakeEl(rect: Rect, scrollTop = 0): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({
        top: rect.top,
        bottom: rect.bottom,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect,
    scrollTop,
    scrollTo() {},
  } as unknown as HTMLElement;
}

test('getObserverRoot returns null for document mode', () => {
  assert.equal(getObserverRoot(DOCUMENT_SCROLL_ROOT), null);
});

test('getSectionOffsetTop uses element scroll coordinates', () => {
  const root = fakeEl({ top: 100, bottom: 500 }, 40);
  const section = fakeEl({ top: 180, bottom: 220 });
  // 180 - 100 + 40 = 120
  assert.equal(getSectionOffsetTop(section, root), 120);
});

test('getSectionOffsetTop uses window.scrollY in document mode', () => {
  const previous = globalThis.window;
  (globalThis as { window: { scrollY: number } }).window = { scrollY: 250 };
  try {
    const section = fakeEl({ top: 80, bottom: 120 });
    assert.equal(getSectionOffsetTop(section, DOCUMENT_SCROLL_ROOT), 330);
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});

test('getCategoryScrollAnchorPosition uses live category bar bottom in document mode', () => {
  const previous = globalThis.window;
  (globalThis as { window: { scrollY: number } }).window = { scrollY: 200 };
  try {
    const bar = fakeEl({ top: 48, bottom: 100 });
    assert.equal(
      getCategoryScrollAnchorPosition(DOCUMENT_SCROLL_ROOT, {
        categoryBar: bar,
        heroCollapsed: true,
        pinnedBarHeight: 48,
        categoryBarHeight: 52,
        extra: 8,
      }),
      200 + 100 + 8,
    );
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});

test('resolveActiveCategoryId works with document scroll root', () => {
  const previous = globalThis.window;
  (globalThis as { window: { scrollY: number } }).window = { scrollY: 0 };
  try {
    const sections: Record<string, HTMLElement> = {
      a: fakeEl({ top: 0, bottom: 10 }),
      b: fakeEl({ top: 300, bottom: 310 }),
    };
    const id = resolveActiveCategoryId(
      ['a', 'b'],
      (key) => sections[key],
      DOCUMENT_SCROLL_ROOT,
      50,
    );
    assert.equal(id, 'a');
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});

test('getScrollPosition and scrollMenuTo use window in document mode', () => {
  let scrolledTo: ScrollToOptions | null = null;
  const previous = globalThis.window;
  (globalThis as {
    window: { scrollY: number; scrollTo: (o: ScrollToOptions) => void };
  }).window = {
    scrollY: 12,
    scrollTo(o) {
      scrolledTo = o;
    },
  };
  try {
    assert.equal(getScrollPosition(DOCUMENT_SCROLL_ROOT), 12);
    scrollMenuTo(DOCUMENT_SCROLL_ROOT, { top: 0, behavior: 'auto' });
    assert.deepEqual(scrolledTo, { top: 0, behavior: 'auto' });
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd frontend && node --experimental-strip-types --test src/lib/digital-menu/categoryScrollSpy.test.ts`

Expected: FAIL (missing exports / signature mismatches)

- [ ] **Step 3: Implement helpers in `categoryScrollSpy.ts`**

```ts
export const DOCUMENT_SCROLL_ROOT = 'document' as const;
export type MenuScrollRoot = HTMLElement | typeof DOCUMENT_SCROLL_ROOT;

export function getObserverRoot(root: MenuScrollRoot): Element | null {
  return root === DOCUMENT_SCROLL_ROOT ? null : root;
}

export function getScrollPosition(root: MenuScrollRoot): number {
  if (root === DOCUMENT_SCROLL_ROOT) return window.scrollY;
  return root.scrollTop;
}

export function scrollMenuTo(root: MenuScrollRoot, options: ScrollToOptions): void {
  if (root === DOCUMENT_SCROLL_ROOT) {
    window.scrollTo(options);
    return;
  }
  root.scrollTo(options);
}

export function getSectionOffsetTop(section: HTMLElement, scrollRoot: MenuScrollRoot): number {
  if (scrollRoot === DOCUMENT_SCROLL_ROOT) {
    return section.getBoundingClientRect().top + window.scrollY;
  }
  const sectionRect = section.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  return sectionRect.top - rootRect.top + scrollRoot.scrollTop;
}

export function getCategoryScrollAnchorPosition(
  scrollRoot: MenuScrollRoot,
  options: {
    categoryBar?: HTMLElement | null;
    heroCollapsed: boolean;
    pinnedBarHeight: number;
    categoryBarHeight: number;
    extra?: number;
  },
): number {
  const { categoryBar, heroCollapsed, pinnedBarHeight, categoryBarHeight, extra = 8 } = options;
  const scrollTop = getScrollPosition(scrollRoot);

  if (categoryBar) {
    const barRect = categoryBar.getBoundingClientRect();
    if (scrollRoot === DOCUMENT_SCROLL_ROOT) {
      return scrollTop + barRect.bottom + extra;
    }
    const rootRect = scrollRoot.getBoundingClientRect();
    return scrollTop + (barRect.bottom - rootRect.top) + extra;
  }

  const offsetFromViewportTop =
    (heroCollapsed ? pinnedBarHeight : 0) + categoryBarHeight + extra;
  return scrollTop + offsetFromViewportTop;
}

// Update resolveActiveCategoryId scrollRoot param type to MenuScrollRoot
```

Keep deprecated `getCategoryScrollAnchorOffset` unchanged.

- [ ] **Step 4: Re-run tests — expect PASS**

Run: `cd frontend && node --experimental-strip-types --test src/lib/digital-menu/categoryScrollSpy.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

Skip (user constraint: no commits unless asked).

---

### Task 2: `useCategoryScrollSpy` document mode

**Files:**
- Modify: `frontend/src/lib/digital-menu/useCategoryScrollSpy.ts`

**Interfaces:**
- Consumes: `DOCUMENT_SCROLL_ROOT`, `MenuScrollRoot`, `getScrollPosition`, `getCategoryScrollAnchorPosition`, `resolveActiveCategoryId` from Task 1
- Produces: options gain `scrollRoot?: MenuScrollRoot` **or** keep `scrollRootRef` and add `useDocumentScroll?: boolean`

Preferred API (minimal churn for desktop/editor):

```ts
type UseCategoryScrollSpyOptions = {
  // ...existing...
  scrollRootRef: RefObject<HTMLElement | null>;
  /** When true, ignore the element and use window/document scroll. */
  useDocumentScroll?: boolean;
};
```

- [ ] **Step 1: Update sync + attach logic**

When `useDocumentScroll`:

- Treat root as `DOCUMENT_SCROLL_ROOT` for math
- Near-bottom: `document.documentElement.scrollHeight - window.innerHeight - window.scrollY <= 48`
- Listen: `window.addEventListener('scroll', handleScroll, { passive: true })`
- Do not wait for `scrollRootRef.current` to attach

When `useDocumentScroll` is false/undefined: keep current element behavior.

- [ ] **Step 2: Typecheck / lint the hook file**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -n 40`  
(or project’s usual check). Fix any type errors introduced.

- [ ] **Step 3: Commit** — skip

---

### Task 3: CSS unlock public mobile shell

**Files:**
- Modify: `frontend/src/components/pages/DigitalMenuPage.module.css`
- Modify: `frontend/src/components/pages/PublicDigitalMenuPage.module.css`

**Interfaces:** none (visual only)

- [ ] **Step 1: Unlock `.phone.publicRoot`**

Replace height lock with growable shell. Example:

```css
.phone.publicRoot {
  width: 100%;
  max-width: 100%;
  height: auto;
  min-height: 100dvh;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: visible;
  font-family: inherit;
  font-weight: inherit;
}

.phone.publicRoot > .phoneScroll {
  flex: 1 1 auto;
  min-height: auto;
  height: auto;
  overflow: visible;
  overscroll-behavior: auto;
}
```

Do **not** change the generic `.phone` / `.phoneScroll` rules used by the editor preview (only `.phone.publicRoot…` overrides).

- [ ] **Step 2: Sticky compact header on public root**

Under `.phone.publicRoot` (or a public-only selector):

```css
.phone.publicRoot .compactHeader {
  position: sticky;
  top: 0;
}
```

Keep visibility classes (`.compactHeaderVisible`) as today.

- [ ] **Step 3: Unlock `.mobileFrame`**

In `PublicDigitalMenuPage.module.css`:

```css
.mobileFrame {
  width: 100%;
  height: auto;
  min-height: 100dvh;
}

.mobileScroll {
  flex: none;
  min-height: auto;
}
```

Leave `.mobileScrollCart` / desktop shell (`publicShell[data-layout='desktop']`) unchanged.

- [ ] **Step 4: Commit** — skip

---

### Task 4: Wire `PublicDigitalMenuPage` mobile to document scroll

**Files:**
- Modify: `frontend/src/components/pages/PublicDigitalMenuPage.tsx`
- Modify: `frontend/src/components/digital-menu/DigitalMenuProductDetail.tsx`
- Modify: `frontend/src/components/digital-menu/PromotionShortcutProductsView.tsx`

**Interfaces:**
- Consumes: `DOCUMENT_SCROLL_ROOT`, `getScrollPosition`, `scrollMenuTo`, `getObserverRoot`, updated spy hook
- Produces: mobile path uses document scroll; desktop unchanged

- [ ] **Step 1: Mobile scroll-spy**

```ts
const { lockScrollSpy: lockMobileScrollSpy } = useCategoryScrollSpy({
  enabled: mobileScrollSpyEnabled,
  categoryIds,
  sectionRefs,
  scrollRootRef: mobileScrollRef,
  useDocumentScroll: true,
  categoryBarRef,
  heroCollapsed,
  pinnedBarHeight: PINNED_BAR_HEIGHT,
  activeCategoryId,
  onActiveCategoryChange: setActiveCategoryId,
});
```

Desktop spy: no `useDocumentScroll`.

- [ ] **Step 2: `scrollToCategory` for mobile**

When `!isDesktopLayout`, use `DOCUMENT_SCROLL_ROOT` with `getCategoryScrollAnchorPosition` / `getSectionOffsetTop` / `scrollMenuTo` instead of `mobileScrollRef.current`.

- [ ] **Step 3: Scroll position + resets**

- `handleMobileScroll`: listen on `window`, `setScrollY(window.scrollY)` (still raf-throttled)
- Subdomain reset / open product / promo / cart: `scrollMenuTo(DOCUMENT_SCROLL_ROOT, { top: 0 })` on mobile; keep element `scrollTo` for desktop ref
- Attach/remove `window` scroll listener in a `useEffect` when `!isDesktopLayout`

- [ ] **Step 4: Hero IntersectionObserver on list**

In the menu-list hero effect, use `root: null` (viewport) when mobile (document scroll). Keep desktop on `desktopScrollRef` as today.

- [ ] **Step 5: Product / promotion detail observers**

Add optional prop:

```ts
useDocumentScroll?: boolean;
```

When true, `IntersectionObserver` uses `root: getObserverRoot(DOCUMENT_SCROLL_ROOT)` i.e. `null`. When false, keep `root: scrollRootRef.current`.

Pass `useDocumentScroll={!isDesktopLayout}` from `PublicDigitalMenuPage` into mobile detail views. Editor preview does not pass it (defaults false).

- [ ] **Step 6: Commit** — skip

---

### Task 5: Verify

**Files:** none new

- [ ] **Step 1: Run unit tests**

```bash
cd frontend && node --experimental-strip-types --test src/lib/digital-menu/categoryScrollSpy.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual smoke (mobile device or DevTools device mode is not enough for chrome hide — prefer real phone)**

1. Open live menu on iOS Safari and/or Android Chrome
2. Scroll down the category list → browser URL bar collapses
3. Compact header + category bar remain sticky/usable
4. Tap category tab → scrolls to section with correct offset
5. Open product / promotion / cart → starts at top; back to list works
6. Desktop public layout still nested-scrolls (no regression)
7. Editor preview phone mock still nested-scrolls

- [ ] **Step 3: Commit** — skip

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Document scroll on public mobile | 3 + 4 |
| CSS unlock publicRoot / phoneScroll / mobileFrame | 3 |
| Compact header sticky | 3 |
| Category bar sticky preserved | 3 (keep sticky; remove ancestor overflow) |
| Scroll helpers / spy / IO for document | 1 + 2 + 4 |
| Overlays unchanged | 3/4 (no edits to overlay CSS) |
| Desktop + editor excluded | 3/4 (selectors + flags) |
| No new branch / no commits | Global Constraints + every Task Step “Commit” skipped |
| Unit tests for helpers | 1 |
| Manual smoke | 5 |

## Placeholder scan

None intentionally left.

## Type consistency

- `DOCUMENT_SCROLL_ROOT` / `MenuScrollRoot` used across Tasks 1–4
- `useDocumentScroll?: boolean` on spy hook + detail components
- `scrollMenuTo` / `getScrollPosition` / `getObserverRoot` are the only new call sites for window APIs
