# Live Menu Checkout — GPS opcional para domicilio

> Status: **Approved** (enfoque A)
> Scope: Menú live — pantalla **Completar pedido** (`PublicMenuCheckoutDetails` / `CheckoutDeliveryAddressPicker`)

## Goal

Cuando el cliente elige **entrega a domicilio**, el checkout le ofrece usar su ubicación GPS para llenar dirección y pin del mapa. Es **opcional**: puede rechazar o escribir el domicilio a mano. El pedido nunca se bloquea por GPS.

## Context

Hoy `CheckoutDeliveryAddressPicker` pide buscar el domicilio (Places Autocomplete) y luego ajustar el pin. Ya existe `reverseGeocodeCoordinates`. No hay `navigator.geolocation`.

El checkout ya persiste dirección y coordenadas en `localStorage` (`preferencesStorage`).

## Approach

**A — Tarjeta de oferta al elegir delivery**, acordado.

- Si no hay domicilio/coords: tarjeta *Permitir ubicación* / *Prefiero escribirla*.
- Si ya hay domicilio guardado: no insistir; botón compacto *Usar mi ubicación*.
- El GPS solo se pide tras un tap (gesto de usuario; iOS/Safari lo exige).
- Tras éxito: reverse geocode → misma ruta que elegir un place (dirección + lat/lng + mapa). El cliente puede arrastrar el pin.

No se pide GPS al entrar a Completar pedido ni si el servicio es recoger.

## Architecture

```
frontend/src/lib/digital-menu/checkout/browserGeolocation.ts
  requestBrowserGeolocation()     ← Promise, testeable, sin React
  isBrowserGeolocationAvailable()

frontend/src/lib/digital-menu/checkout/checkoutGpsOffer.ts
  resolveCheckoutGpsOffer()       ← qué UI mostrar (tarjeta / botón / nada)

CheckoutDeliveryAddressPicker.tsx
  UI de oferta + botón compacto + estados loading/error
  onChange con address + coords (igual que Places)
```

Unidades:

| Unidad | Hace | Depende de |
|--------|------|------------|
| `browserGeolocation` | Llama GPS del navegador o explica por qué no | `navigator.geolocation`, secure context |
| `checkoutGpsOffer` | Decide tarjeta vs botón vs oculto | coords/address actuales, dismissed, API disponible |
| `CheckoutDeliveryAddressPicker` | Pide permiso, geocodifica, pinta mapa | las dos anteriores + `reverseGeocodeCoordinates` |

`PublicMenuCheckoutDetails` no cambia de flujo: sigue recibiendo `onChange` del picker. La cotización de envío se dispara sola cuando hay lat/lng.

## Data flow

1. Delivery seleccionado y cobertura disponible → se monta el picker.
2. `resolveCheckoutGpsOffer`:
   - sin geolocation o sin Maps API key → ninguna oferta GPS
   - hay lat+lng (p. ej. preferencia guardada) → botón compacto
   - usuario eligió “Prefiero escribirla” en esta sesión → botón compacto
   - vacío → tarjeta de oferta
3. Tap *Permitir ubicación* / *Usar mi ubicación* → `getCurrentPosition` (high accuracy, timeout 12s, `maximumAge` 15s).
4. Éxito → reverse geocode → `onChange({ address, latitude, longitude, placeId: null })` → mapa + pin.
5. Si reverse geocode falla pero hay coords: igual emitir lat/lng; dirección puede quedar vacía hasta que el cliente busque o mueva el pin (el geocode del drag ya cubre esto). Preferir no dejar al cliente sin mapa: emitir coords siempre.
6. Negación / timeout / GPS apagado → mensaje no bloqueante; buscador intacto; el botón compacto sigue visible para reintentar.

No persistir un flag de “GPS permitido”. El navegador ya guarda el permiso. El dismiss de la tarjeta es solo estado de sesión en el picker (`useState`).

## UI / copy

Tokens existentes `--dm-*`. Iconos MUI (`MyLocationOutlined`), no emojis. `cursor-pointer`, transiciones 150–250ms, `prefers-reduced-motion`.

**Tarjeta (sin domicilio):**

- Título: `¿Usar tu ubicación?`
- Texto: `Llenamos tu domicilio automáticamente. Es opcional; después puedes ajustar el pin.`
- Primario: `Permitir ubicación`
- Secundario: `Prefiero escribirla`

**Botón compacto:** junto al buscador, etiqueta `Usar mi ubicación` (no solo ícono).

**Estados:**

| Estado | UI |
|--------|----|
| `requesting` | “Obteniendo tu ubicación…” + control ocupado (`aria-busy`) |
| `denied` | “No se usó la ubicación. Busca tu domicilio abajo.” |
| `unavailable` / timeout | “No encontramos tu GPS. Búscalo o inténtalo de nuevo.” |
| `unsupported` | Sin tarjeta ni botón |

El buscador permanece siempre visible debajo de la oferta.

## Error handling

| Caso | Comportamiento |
|------|----------------|
| HTTP / sin `geolocation` / `!isSecureContext` | No mostrar oferta |
| Permiso denegado (`PERMISSION_DENIED`) | Mensaje `denied`; no reabrir el diálogo nativo hasta otro tap |
| Posición no disponible / timeout | Mensaje `unavailable`; reintento con el botón |
| Maps API key ausente | Fallback textarea actual; **sin** GPS (no hay reverse geocode ni mapa) |
| Reverse geocode lento/falla | Overlay “Actualizando ubicación…” ya existente; coords sí se aplican |
| Recoger en local | Cero UI de GPS |

Checkout y validación actuales no cambian: delivery sigue exigiendo dirección + coords. GPS es un atajo, no un campo obligatorio nuevo.

## Testing

- Unit: `isBrowserGeolocationAvailable` (secure / inseguro / sin API).
- Unit: `requestBrowserGeolocation` — success, denied, timeout, unsupported (mock de `navigator.geolocation`).
- Unit: `resolveCheckoutGpsOffer` — vacío → tarjeta; dismissed o coords → botón; unsupported → none.
- Manual (HTTPS): delivery sin dirección → tarjeta → permitir → pin; denegar → buscar a mano; con dirección guardada → no tarjeta, sí botón; recoger → sin GPS; iPhone Safari (tap requerido).

## Fuera de alcance

- Pedir GPS al abrir Completar pedido o en recoger.
- WatchPosition / tracking continuo.
- Backend nuevo; el pedido ya envía lat/lng.
- Background geolocation / PWA nativa.
- Cambiar el fallback sin Maps API.

## UX checklist (ui-ux-pro-max)

- Sin emojis como íconos
- `cursor-pointer` en ambos CTAs
- Hover/focus visibles; transiciones 150–300ms
- Labels / `aria-label` en controles; `aria-live` en loading y errores
- Color no es el único indicador (texto + ícono)
- `prefers-reduced-motion`
- Responsive 375px–1440px; sin scroll horizontal extra
