# Low-stock urgency badge + closing countdown

**Date:** 2026-09-05  
**Status:** Approved (user chose timer policy C; design option 1)

## Goal

In the live digital menu, when a product shows low stock (“¡Date prisa! Quedan pocas”):

1. The badge uses a **warm urgency tint mixed into the active theme surface** so it reads as scarcity on every theme (light/dark/brand).
2. Show **one** countdown: **promo timer if present**, otherwise **same-day restaurant closing** (“Cierra en”). Mobile-first, compact chips.

## Behavior

| Condition | UI |
|-----------|-----|
| `show_low_stock` | Urgency badge |
| Low stock + product already has promo countdown | Badge + existing promo countdown only (no second timer) |
| Low stock + no promo countdown + closing deadline today | Badge + closing countdown |
| Low stock + no promo + no closing today | Badge only |
| Not low stock | Unchanged |

Reuse `getRestaurantClosingDeadlineToday` from `promotionCountdown.ts` with the same `PromotionCountdownContext` (schedules + enabled services) and restaurant timezone.

## Visual

- Derive `--dm-low-stock-*` from a fixed warm urgency hue (`#EA580C`) mixed with theme `surface` / `border` (not raw `secondary`).
- Closing countdown reuses compact countdown styling, tinted with the same low-stock tokens.
- Chips: single line, `nowrap`, wrap as a flex row under the product name on narrow widths.

## Out of scope

- Changing inventory / threshold logic
- Showing closing countdown when stock is not low
- Desktop-only layouts
