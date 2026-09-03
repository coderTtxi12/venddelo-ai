# Historial de pedidos: rediseño tipo Clientes

**Fecha:** 2026-09-03  
**Estado:** Aprobado  
**Ruta:** `/history` (panel restaurante)  
**Referencia UI:** `/clientes` (`CustomersPage`)

## Resumen

Rediseñar todo `/history` para que se sienta y funcione como `/clientes`: mobile-first, métricas, búsqueda, filtros server-side, tabla en desktop / cards en mobile, drawer de detalle y paginación con `total` en backend. Se abandona el board tipo cocina (lista + panel split + infinite scroll) solo en historial; la cocina (KDS) no cambia.

Trabajo en la branch actual; sin crear otra branch ni commits hasta que el usuario lo pida.

## Decisiones

| Tema | Decisión |
|------|----------|
| Detalle | Drawer / bottom sheet (mismo patrón que Clientes) |
| Navegación de lista | Paginación cursor + `total` (no infinite scroll) |
| Filtros | Estado + búsqueda + tipo + pago + rango de fechas |
| Arquitectura | Extender `GET .../orders` con `board=history`; no endpoint nuevo |
| Visual | Tokens del panel existentes; espejo de `CustomersPage.module.css` |
| 4º metric | Pedidos de entrega (`type=delivery`) en history |
| Fechas | Presets Hoy / 7d / 30d / Todo + personalizado `from`/`to` |
| Timezone fechas | UTC del día calendario enviado (`from`/`to` como date ISO `YYYY-MM-DD`); fin del día inclusivo en UTC |

## Layout (mobile-first)

### Mobile (&lt;768px)

1. Header: título **Historial** + subtítulo (“Pedidos entregados y cancelados.”).
2. Métricas en grid 2×2: Total · Entregados · Cancelados · Entrega.
3. Búsqueda full-width (placeholder: nombre, celular o #pedido).
4. Filtros en grid 2 columnas con `ToolbarSelect`: Estado, Tipo, Pago, Fechas, Ordenar (solo mobile), Limpiar filtros.
5. Contador sticky del resultado filtrado.
6. Lista de **cards** (sin tabla): `#id`, cliente, badge de estado con texto, total, tiempo relativo, chevron.
7. `ListPagination` sticky inferior (safe-area).
8. Tap en card → bottom sheet de detalle.

### Desktop (≥768px)

- Header en fila: título | métricas en línea.
- Tabla sortable: Pedido · Cliente · Celular · Tipo · Pago · Total · Estado · Fecha.
- Click / Enter / Space en fila → drawer lateral.
- Sin columna de “Ordenar” en toolbar (sort en headers).

## Filtros y query params

Todos se aplican **en el servidor** cuando `board=history`.

| UI | Valores | Param | Notas |
|----|---------|-------|-------|
| Estado | Todos / Entregados / Cancelados | `status` | Omitir si Todos; solo `delivered` \| `cancelled` |
| Tipo | Todos / Entrega / Para llevar | `type` | `delivery` \| `takeout` |
| Pago | Todos / Efectivo / Transferencia / Terminal | `payment_method` | `cash` \| `transfer` \| `card_terminal` |
| Fechas | Hoy · 7 días · 30 días · Todo · Personalizado | `from`, `to` | Date ISO; omitir ambos = Todo |
| Buscar | texto libre, debounce 250ms | `q` | Display id, `customer_name`, dígitos de `customer_phone` |
| Orden | fecha · total | `sort`, `order` | Default `created_at` + `desc` |

Al cambiar cualquier filtro, búsqueda o sort: reset de paginación a la primera página (cursor stack vacío).

### Sort permitido

- `created_at` (default) — columna “Fecha” / “Más recientes”
- `total_cents` — columna “Total”

No ordenar por `#` de display: ese valor se deriva de `note` o del id corto en el frontend (`formatOrderDisplayId`), no es columna indexable estable.

`order`: `asc` \| `desc`.

## Paginación backend

Hoy `CursorPage` solo tiene `items`, `next_cursor`, `has_more` (sin `total`). Clientes ya devuelve `total`.

**Cambio:** la respuesta de `GET /restaurants/{id}/orders` incluye `total: int | null`. Cuando `board=history`, `total` es el COUNT con los **mismos** filtros de la lista (no el summary global). Cuando `board=kitchen`, `total` puede ser `null` (kitchen sigue con infinite scroll y no depende de total).

- `limit` default 20 en history (FE), max existente (`MAX_LIMIT`).
- Cursor: **keyset compuesto** `(sort_column, id)` siempre:
  - sort `created_at`: `(created_at, id)` como hoy
  - sort `total_cents`: `(total_cents, id)` con comparación acorde a `order`
- Frontend: stack de cursors como `CustomersPage` + `ListPagination` (prev/next por página).

Kitchen (`board=kitchen`) intacto. Params de filtro history (`q`, `type`, `payment_method`, `from`, `to`, `sort`) en kitchen: **se ignoran** (no 400) para no romper clientes antiguos.

## Summary / métricas

Seguir usando `GET .../orders/summary?board=history` para:

- `total` → metric Total  
- `delivered` → Entregados  
- `cancelled` → Cancelados  

**Extender** `OrderStatusSummaryDTO` (o campo hermano) con:

- `delivery: int` — count de pedidos history con `type == delivery`

Las métricas del header **no** se reducen por los filtros de la lista (igual que Clientes: stats globales vs `total` filtrado del list).

## Drawer de detalle

Componente nuevo `OrderHistoryDetailDrawer`:

- Solo lectura.
- Contenido: `#` display, cliente, teléfono / WhatsApp, tipo, pago, fecha/hora, motivo de cancelación si aplica, lista de ítems (`qty × nombre`), total.
- Layout por secciones (estilo `CustomerDetailDrawer`), no el ticket crudo del board cocina.
- Shell del drawer reutiliza el mismo patrón a11y que Clientes (Escape, focus close, body overflow, handle mobile).

## Estados UI

| Estado | UI |
|--------|-----|
| Loading inicial | State box “Cargando historial…” |
| Error | Mensaje + Reintentar |
| Vacío global | “Aún no hay pedidos cerrados” |
| Vacío por filtros | “Sin coincidencias” + Limpiar filtros |
| Soft loading | Opacidad en lista al cambiar página/filtro |

## Accesibilidad y mobile

- Touch targets ≥44px; search clear / icon buttons ampliados en mobile.
- Focus visible; `aria-sort` en headers; `aria-pressed` / `aria-selected` en cards/filas.
- Badges de estado con texto (no solo color).
- `prefers-reduced-motion`; safe-area en sheet y pagination sticky.
- Contador sticky con backdrop blur como Clientes.

## Archivos

| Acción | Path |
|--------|------|
| Página principal | `frontend/src/components/pages/OrderHistoryPage.tsx` |
| Estilos | `frontend/src/components/pages/OrderHistoryPage.module.css` |
| Drawer | `frontend/src/components/orders/OrderHistoryDetailDrawer.tsx` |
| Dejar de usar en ruta | `OrderHistoryView.tsx` (puede quedar sin referenciar o eliminarse si no tiene otros usos) |
| Ruta | `frontend/src/app/(panel)/history/page.tsx` → `OrderHistoryPage` |
| API FE | `frontend/src/lib/api/orders.ts` + tipos `CursorPage`/`total` |
| Backend | `orders/api.py`, `service.py`, `adapters.py`, `schemas.py` (summary + page total) |
| Tests | backend list/filter/total; FE smoke de display helpers si se añaden |

## Fuera de alcance

- Acciones de cocina (confirmar, cancelar, dispatch) desde historial.
- Export CSV / impresión.
- Cambios al board cocina / KDS / infinite scroll de cocina.
- Nueva branch o commits automáticos.
- Paleta tipográfica distinta a la del panel.

## Criterio de hecho

1. `/history` se ve y navega como `/clientes` en 375px y desktop.
2. Búsqueda, filtros y paginación resuelven en backend con `total` correcto.
3. Detalle abre en drawer/sheet; cocina intacta.
4. Tests de API cubren filtros history + total.

## Enfoque descartado

- Filtrar solo en cliente sobre páginas cursor (incorrecto con paginación real).
- Endpoint dedicado `/orders/history` (duplicaría el board history).
