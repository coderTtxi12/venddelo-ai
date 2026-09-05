# Low-stock urgency + closing countdown Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Theme-blended urgency low-stock badge plus a single countdown (promo first, else restaurant closing today).

**Architecture:** Derive warm urgency CSS vars in `deriveLowStock`; add a closing countdown helper/hook reusing `getRestaurantClosingDeadlineToday`; show it from product UI only when low-stock and no promo countdown.

**Tech Stack:** Next.js frontend, CSS modules, existing digital-menu theme tokens, `node:test`.

## Global Constraints

- Mobile-first compact chips; norap labels
- Timer policy C: promo wins; else closing
- Urgency color = warm orange mixed with theme surface

---

### Task 1: Urgency color tokens

- [ ] Update `deriveLowStock.ts` to mix `#EA580C` into theme surface/border
- [ ] Update tests
- [ ] Wire already present in `applyTheme.ts`

### Task 2: Closing countdown lib + hook

- [ ] Add helper for restaurant closing countdown state (label “Cierra en”, format via `formatCountdownDuration`)
- [ ] Add hook ticking every 1s when deadline exists
- [ ] Tests for helper when open today / closed / no schedules

### Task 3: Product UI

- [ ] Extend `ProductLowStockBadge` / card content to show compact closing timer when no promo countdown
- [ ] Pass timezone + countdownContext into low-stock UI
- [ ] Match PublicDesktopMenuLayout / detail if needed
- [ ] CSS: flex wrap row, shared urgency tokens, mobile-first

### Task 4: Verify

- [ ] Run theme + countdown unit tests
