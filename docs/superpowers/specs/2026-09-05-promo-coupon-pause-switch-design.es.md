# Switch de pausa en /promociones y /cupones

**Fecha:** 2026-09-05  
**Estado:** Pendiente de review del usuario  
**Idioma UI:** español

## Objetivo

En las listas de **Promociones** y **Cupones**, permitir **pausar** o **reactivar** un ítem con un switch, sin abrir el formulario. La pausa es temporal y reversible hasta reactivación manual. Distinta de **Eliminar**.

## Decisiones validadas

| Tema | Decisión |
|------|----------|
| Semántica | Pausa ≠ soft-delete |
| Ubicación del switch | Solo lista (cards móvil + tabla desktop); no en forms |
| Feedback | Sin modal ni toast; switch + pill reflejan resultado del backend |
| Interacción | Controlado + pending (no optimistic) |
| Enfoque UI | Switch `role="switch"` (estilo inventario / Settings) |

## Modelo de datos

Misma semántica en cupones y promociones:

| Campo | Significado |
|-------|-------------|
| `is_active = true` | Habilitada; el estado efectivo depende de fechas/horario/stock |
| `is_active = false` | **Pausada**: visible en admin; no aplica en menú/checkout |
| `deleted_at != null` | Soft-delete (**Eliminar**); no aparece en la lista admin |

No se añade columna nueva: se reutiliza `is_active`.

## Backend — promociones (cambio requerido)

Hoy `is_active=false` actúa como soft-delete (list solo `is_active=true`; `soft_delete` pone `is_active=false` + `deleted_at`; `get`/`update` rechazan inactivas; `PromotionUpdate` no incluye `is_active`).

Alinear con cupones:

1. **Listar** filas con `deleted_at IS NULL` (incluye pausadas).
2. **Soft-delete:** set `deleted_at` (y `is_active=false` como hoy); la **pausa** solo pone `is_active=false` y **no** toca `deleted_at`.
3. Añadir `is_active: bool | None` a `PromotionUpdate` y propagarlo en el adapter.
4. `get` / `update` operan sobre filas con `deleted_at IS NULL` (aunque `is_active=false`).
5. Pricing / `effective_status`: si `!is_active` → `inactive` (prioridad como cupones).
6. Tool `disable_promotion`: pausa (`is_active=false`), no soft-delete.
7. API pública / menú: solo promos no borradas **y** `is_active=true` (más reglas de vigencia existentes).

## Backend — cupones

Ya soportan PATCH `is_active` independiente de `deleted_at`. Sin cambio de modelo; solo UI de lista.

## Frontend — UI

### Control

- Componente reutilizable `ActivePauseSwitch`: `checked`, `pending`, `disabled`, `ariaLabel`, `onChange`.
- Estilo alineado a `ProductsInventoryLiveToggle` / Settings switch.
- Touch target ≥ 44px; gap ≥ 8px con icon buttons vecinos.
- En cards y filas: `stopPropagation` para no abrir el sheet.

### Labels (a11y)

| Estado | `aria-label` ejemplo |
|--------|----------------------|
| Activa | `Pausar promoción …` / `Pausar cupón …` |
| Pausada | `Reactivar promoción …` / `Reactivar cupón …` |

### Feedback (sin toast)

1. **Pending:** switch `disabled` + `aria-busy`; opacidad reducida.
2. **Éxito:** switch y pill actualizan con la respuesta del API (`is_active`, `effective_status`).
3. **Error:** rollback visual; mensaje corto `role="alert"` inline bajo la card/fila.

### Pill / copy

- `effective_status === 'inactive'` (pausa) → label **Pausada** (cupones: unificar desde “Inactivo”).
- Card/fila pausada: opacidad ~0.85 en el bloque principal; el switch permanece legible.

### Dónde

- `PromotionListCard` + columna Acciones de `PromotionsPage`.
- `CouponListCard` + columna Acciones de `CouponsPage`.
- Promos “Desde producto”: también pausables.
- **Fuera de alcance:** toggle en `PromotionForm` / `CouponForm` (el form de cupones puede conservar su checkbox interno sin cambios de producto en este trabajo).

## Flujo de datos (páginas)

1. Usuario toca el switch → id entra en `pendingIds`.
2. `updatePromotion` / `updateCoupon` con `{ is_active: next }`.
3. OK → merge del ítem en estado local con la respuesta; quitar pending.
4. Error → no persistir cambio; alert inline en esa fila; quitar pending.

## Filtros y stats

- El filtro de estado “inactivo” / equivalente incluye pausadas (`effective_status === 'inactive'`).
- Contadores existentes siguen la misma semántica de `effective_status`.

## Tests

**Backend**

- List incluye pausadas; soft-deleted no aparecen.
- PATCH pausa y reactiva.
- Pricing / effective status ignora pausadas.
- Soft-delete sigue ocultando el ítem.

**Frontend**

- Labels **Pausada**.
- Display helpers.
- Handler: pending → success merge / error rollback (si hay harness unitario).

## Fuera de alcance

- Toast o modal de confirmación al pausar.
- Campo DB nuevo (`paused_at`, etc.).
- Cambiar copy del form de cupones más allá de alinear label de lista si se toca el helper compartido.
- Migración de datos históricos: promos con `is_active=false` y `deleted_at` set siguen siendo soft-deleted; no hay backfill de “pausadas” inventadas.

## Criterios de éxito

- En móvil y desktop, el admin puede pausar/reactivar desde la lista.
- Ítem pausado permanece visible con pill **Pausada** y switch OFF.
- Menú/checkout no aplican ítems pausados.
- Eliminar sigue siendo soft-delete con confirmación existente.
- Fallo de red no deja el switch en un estado mentiroso.
