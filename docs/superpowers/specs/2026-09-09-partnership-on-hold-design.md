# Partnership on hold (Mexy weekly fee pause)

**Date:** 2026-09-09

## Goal

Mexy can pause a restaurant’s courier from `/partnerships` when the weekly service fee is unpaid. New delivery requests stop. The public digital menu keeps working but **hides delivery with no customer-facing message**. Mexy can reactivate the same partnership; the restaurant does not reconfigure delivery, zone, or payments.

## Non-goals

- Automatic billing, invoices, or dunning.
- Cancelling in-flight dispatch requests.
- Pausing the whole digital menu or `restaurant.delivery_enabled`.
- Reusing partnership `status = suspended` (that means a replaced Mexy link).

## Decision

Keep `restaurant_delivery_providers.status = 'active'` and add `on_hold: bool` (default `false`). Unhold is `on_hold = false` on the same row.

## Rules

- In-flight dispatch (`searching` / `offered` / `assigned` / `picked_up` / `in_transit`) continues to delivery or restaurant cancel as today.
- New dispatch create is rejected while `on_hold`.
- Public quotes and checkout treat hold as “delivery is not an ordering option”.
- Weather, schedule, and zone-wide Mexy pause stay as they are (they may still show an alert if the customer can see delivery). Hold never shows an alert on the public menu.
- `delivery_enabled`, zone, `has_web_app`, and payment methods are unchanged by hold/unhold.
- Toggle requires `require_manage_partnerships` (owner / admin / operator).

## Data

Migration after `0076_partnership_web_app`:

- `restaurant_delivery_providers.on_hold` boolean `NOT NULL` default `false`.

DTOs:

- `DeliveryPartnershipRequestDTO.on_hold`
- `RestaurantDeliveryPartnershipDTO.on_hold`
- `DeliveryPartnershipUpdate.on_hold: bool | None`
- `PublicDeliveryServiceDTO.on_hold: bool = false`
- `ResolvedDeliveryService.on_hold: bool = false`

List active partnerships: query param `on_hold` like `has_web_app` (`true` / `false` / omit).

## Backend

`PublicDeliveryQuoteService.resolve_delivery_service`: if partnership is `active` and `on_hold`, return `available=False`, `on_hold=True`, `partnership_status='active'`. Restaurant panel may use `reason` for its own banner. Public checkout **must not render that reason**.

`quote_delivery`: same gate before coverage/weather.

`RestaurantDispatchService.create` (and any other new-offer path): if `on_hold`, `ValidationError` with restaurant copy (not the generic “no tienes un repartidor activo”). List / cancel / confirm-cash / progress on existing requests still allowed.

`PATCH /delivery-providers/me/partnerships/{link_id}` accepts `{ on_hold }`. After change, `notify_restaurants_delivery_service_updated(restaurant_id)` so `/delivery` refreshes.

Accepting a new partnership starts `on_hold=false`.

## Mexy `/partnerships`

Active cards stay in the Activos tab.

- Badge **En hold** when `on_hold` (label + color; not color alone).
- Control to hold / unhold, same permission as zone / web app.
- Confirm before turning hold **on** (pause a live business). Unhold can be immediate.
- Filter: Todas / En hold / Sin hold, same pattern as web app.

Copy on confirm: pause deliveries for this business until they pay; existing trips finish.

Icons: existing MUI set in delivery-dashboard (pause / play), not a new icon library.

## Restaurant `/delivery` and order dispatch drawer

Partnership stays `active`, so the Delivery nav remains.

When `delivery_service.on_hold`:

- Do **not** use `CourierUnavailableAlert` (that copy is for weather / hours / Mexy zone pause).
- Show a friendly `role="alert"` notice with a recovery action.
- Hide / disable the new-request form.
- Keep the list of existing requests.

Copy:

- Title: `Mexy pausó las entregas de tu negocio`
- Detail: `Escríbenos por WhatsApp para reactivarlas. Los envíos que ya están en camino siguen.`
- CTA: `Escribir a Mexy` → `https://wa.me/525574277066` (display number `55 7427 7066`)

Same notice in `OrderDispatchDrawer` when creating a courier request from an order.

## Public digital menu (customer ordering)

Audience: customers on the restaurant live menu, not the restaurant dashboard.

While `on_hold`:

- Do not show “Entrega a domicilio” in hero chips.
- Do not show delivery in the checkout service radios.
- Do not show `deliveryAlert`, “elige recoger”, “servicio suspendido”, or any hold/payment copy.
- If stored checkout prefs were `delivery`, silently default to takeout when takeout exists.
- Takeout, catalog, and takeout payments unchanged.

Implementation: `resolveAvailableServices` (and public chips) omit delivery when `delivery_service.on_hold`. Do **not** omit delivery for other `available=false` reasons (rain / hours still use today’s selectable + alert behavior).

Do not set the restaurant’s stored `delivery_enabled` to false.

Tampered `POST` public orders with `type=delivery` while on hold must fail without hold/payment copy (same unavailable path as a paused courier: payment/service not available).

## Error handling

- Mexy toggle failure: inline error on the card / page, partnership unchanged.
- Restaurant create-dispatch while held: API error; UI should already be blocked, but the message must be the WhatsApp hold copy, not “repartidor activo”.
- Dispatcher / driver cannot PATCH `on_hold` (403).

## Tests

- Quote/service: active + `on_hold` → unavailable, `on_hold=true`; unhold restores availability without other field changes.
- Dispatch create rejected on hold; create allowed after unhold; existing assigned request can still progress.
- PATCH `on_hold` requires manage-partnerships; list filter `on_hold=true`.
- Fulfillment helper: `on_hold` drops delivery from customer services; weather-unavailable still includes delivery as a service type.
- WhatsApp URL helper: digits `525574277066`.
- Restaurant notice copy does not leak into public fulfillment.

## UI notes (ui-ux-pro-max)

- Empty / blocked restaurant state includes a next step (WhatsApp), not a blank form.
- `role="alert"` on the restaurant notice; focusable heading.
- Badge text “En hold”, not color-only.
- Confirm destructive hold; do not confirm unhold.
- Public path: no error UI when the option is simply absent.
