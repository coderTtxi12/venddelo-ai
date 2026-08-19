# Historial de despacho (rider + dashboard delivery)

**Fecha:** 2026-08-18  
**Estado:** Diseño aprobado en chat — pendiente review del archivo antes del plan  
**Apps:** `backend/`, `apps/rider`, `delivery-dashboard/`

## 1. Objetivo

Que el repartidor vea **sus** pedidos cerrados (entregados y cancelados) con ganancias del periodo y crédito. Que la empresa de delivery vea el **mismo universo** con todos los campos operativos, desde un ítem **Historial** en el sidebar.

El perfil en vivo (`GET /rider/me`) **no** incluye historial. Sigue trayendo solo asignaciones activas.

## 2. Decisiones

| Tema | Decisión |
|------|----------|
| Estados | `delivered` y `cancelled`. No `unassigned`. |
| Quién ve qué (rider) | Solo filas con `assigned_driver_id` = su driver. Cancelados nunca asignados a él no aparecen. |
| Quién ve qué (dashboard) | Toda la empresa (zona actual). Operador/admin/owner: lectura. |
| Periodos UI | **Hoy / Semana / Mes / Rango**. Calendario en `America/Mexico_City`, no “últimos 7 días”. |
| Semana | Lunes 00:00 → domingo 24:00 de la semana que contiene “hoy”. |
| Mes | Día 1 00:00 → último día 24:00 del mes calendario actual. |
| Rango | Fechas `start` y `end` inclusive en Mexico City. |
| API de fechas | Query `start` y `end` (`YYYY-MM-DD`). El servidor convierte a UTC: `[start 00:00, end+1 00:00)` Mexico City. Default: hoy. |
| Cierre | `closed_at = cancelled_at` si cancelado; si no `updated_at` del entregado. No hay columna `delivered_at` en v1. |
| Ganancias | Suma de `quoted_fee_cents` de filas **entregadas** en el rango (todo el rango, no la página). Cancelados = 0. |
| Crédito | Límite / hold / disponible del driver; lista de holds `held`. |
| Paginación | `limit` default 50, máx 100; `offset`; `has_more`. Totales y ganancias **globales al filtro**. |
| Zona dashboard | Mismo `zone_id` que el monitor (`ALL` = sin filtro de zona). |
| Fuera de alcance | Liquidaciones/pagos, documentos, notificaciones, editor de zona en la app, `unassigned`, inflar `/rider/me`. |

## 3. Backend

Servicio compartido `list_dispatch_history(...)` usado por dos HTTP.

### 3.1 Rider

`GET /api/v1/rider/me/history`

Query: `start`, `end`, `status` (`delivered` \| `cancelled` \| omitir = ambos), `limit`, `offset`.

No acepta `driver_id`. 401 si no hay sesión; 403 si el user no es driver activo.

Respuesta:

```json
{
  "start": "2026-08-18",
  "end": "2026-08-18",
  "items": [
    {
      "id": "uuid",
      "short_id": "AB12CD34",
      "status": "delivered",
      "closed_at": "2026-08-18T22:15:00Z",
      "restaurant_name": "...",
      "restaurant_address": "...",
      "dropoff_address": "...",
      "quoted_fee_cents": 4500,
      "payment_method": "cash",
      "collect_cents": 25000,
      "cash_denomination_cents": 50000,
      "package_count": 1,
      "package_size": "normal",
      "customer_name": "...",
      "customer_phone": "...",
      "notes": null,
      "credit_hold_cents": 0
    }
  ],
  "total": 12,
  "delivered_count": 10,
  "cancelled_count": 2,
  "earnings_cents": 45000,
  "has_more": false,
  "credit_limit_cents": 50000,
  "credit_held_cents": 8000,
  "credit_available_cents": 42000,
  "active_holds": [
    {
      "request_id": "uuid",
      "short_id": "...",
      "restaurant_name": "...",
      "amount_cents": 8000,
      "customer_name": "..."
    }
  ]
}
```

`credit_hold_cents` en el item: monto del hold de ese pedido si sigue `held`; 0 si no hay o ya se liberó.

### 3.2 Dashboard

`GET /api/v1/delivery-providers/me/dispatch-history`

Query: lo del rider + `driver_id` opcional + `zone_id` opcional. Sin búsqueda de texto en v1.

Auth: miembro del provider (`_require_provider_id`).

Cada item incluye además:

- `assigned_driver_id`, `assigned_driver_name`
- `zone_id`, `zone_name`
- `restaurant_lat`, `restaurant_lng`, `dropoff_lat`, `dropoff_lng`, `dropoff_maps_url`
- `ready_at`, `search_at`, `created_at`, `cancelled_at`, `updated_at`
- `dispatch_group_id`, `case_applied` (última oferta aceptada, igual que monitor)
- `quoted_fee_cents`, `notes`, hold (`credit_hold_status`, `credit_hold_cents`)

Orden: `closed_at` desc, luego `created_at` desc.

Índice a usar: existente `ix_delivery_dispatch_requests_driver_lookup` (rider) y `ix_delivery_dispatch_requests_provider_lookup` (dashboard). Filtrar status + rango en SQL; no cargar el monitor snapshot.

## 4. App rider (`apps/rider`)

### 4.1 Navegación

El botón circular de **logout** del mapa se sustituye por **Cuenta** (ícono de persona, tooltip `Cuenta`). Abre `AccountScreen` a pantalla completa. El back del sistema y un botón atrás vuelven al mapa. `AuthGate` no cambia el flujo de permisos/ofertas.

**Cerrar sesión** vive al final de `AccountScreen`, estilo destructivo (`AppColors.danger`), nunca como CTA primario.

### 4.2 Cuenta

Estilo: paleta actual `AppColors` (fondo `#FAFAF7`, superficie blanca, acento azul, texto zinc). Swiss/minimal: mucho aire, chips, sin emojis, sin serif nuevas. Listas con `ListView.builder` + `ValueKey(id)`.

Bloques, de arriba a abajo:

1. App bar: atrás + título `Cuenta`.
2. Cabecera: foto si existe, nombre, chip En línea / Desconectado.
3. Tres métricas del **periodo seleccionado**: Ganancias / Crédito disponible / En hold. Tipografía numérica bold; labels `textSecondary`.
4. Holds activos: si hay, lista compacta (restaurante + monto). Si no, no se muestra la sección.
5. Segmented **Hoy | Semana | Mes | Rango**. Rango abre un date range (inicio → fin) y aplica al confirmar. Chip activo = acento; `role`/Semantics para accesibilidad.
6. Lista de historial. Card: `#short_id`, restaurante, dropoff (máx 1 línea), hora local Mexico, tarifa, badge Entregado (verde) / Cancelado (muted). Tap → detalle.
7. Detalle: los campos del item rider (cliente, teléfono con `tel:`, cobro/billete, paquetes, notas, hold).
8. Cerrar sesión.

Vacío: “Aún no hay pedidos en este periodo.” Error de red: `networkUnavailableMessage` (Wi‑Fi). Pull-to-refresh. No mezclar pedidos activos aquí.

Periodo: el cliente calcula `start`/`end` en Mexico City y los manda como fechas. Ganancias en UI = `earnings_cents` del API, no la suma de la página visible.

## 5. Dashboard (`delivery-dashboard`)

- Sidebar: **Historial** (`HistoryOutlined`) inmediatamente **después de Monitor**, path `/historial`.
- Ruta: `src/app/(panel)/historial/page.tsx` → `HistoryPage`.
- No reutilizar el placeholder `/orders` (copy de restaurante).
- Shell: `PanelPageShell` título `Historial`, subtítulo `Pedidos entregados y cancelados`.
- Filtros: chips Hoy/Semana/Mes/Rango; `FormSelect` repartidor (Todos + lista); estado Todos/Entregados/Cancelados. Respeta `selectedZoneId` del `DeliveryZoneContext` (query `zone_id` como monitor).
- Desktop: tabla densa (fecha cierre, `#`, estado, restaurante, cliente, dropoff, repartidor, zona, pago, cobro, tarifa, paquetes). `cursor-pointer` en fila; hover color/borde, no scale.
- Mobile: cards con los mismos datos clave.
- Click → `RightDrawer` con el set completo (coords + links maps, teléfono, billete, notas, caso, grupo, hold, timestamps). Reusar copy de `monitorCopy.ts` (`paymentLabel`, `requestStatusLabel`, etc.) donde exista; añadir labels de `delivered`/`cancelled` si faltan.
- Vacío: “No hay pedidos cerrados en este periodo.” Carga: atenuar lista, no pantalla completa. Paginación “Cargar más” si `has_more`.
- A11y: focus visible, teclado, contraste AA, `prefers-reduced-motion`, iconos MUI (no emojis).

## 6. UI (ui-ux-pro-max)

- **No** adoptar la tipografía serif del `--design-system` genérico (EB Garamond). Seguir tokens ya usados: rider `AppColors`, dashboard CSS modules del panel.
- Flutter: `ListView.builder`, keys, back predecible.
- Web: filtros visibles, empty state con mensaje, transiciones 150–300ms, `cursor-pointer`.
- Anti-patrones: historial en el poll de GPS; logout como único botón del mapa; ganancias calculadas solo con la página actual.

## 7. Tests

Backend (API, DB):

- Rider: tras entregar, el pedido sale de `/me` y entra en `/me/history` del día.
- Rider: cancelado asignado a él aparece; cancelado de otro driver no.
- Rider: el endpoint **no declara** `driver_id`; la query siempre filtra el driver autenticado.
- Ganancias: dos entregas + un cancelado en el rango → `earnings_cents` = suma de las dos tarifas.
- Rango: pedido cerrado ayer no aparece en `start=end=hoy`.
- Dashboard: lista de la empresa; `driver_id` filtra; `zone_id` filtra; miembro de otro provider 403/404 igual que monitor.
- Paginación: `limit=1` → `has_more` true si hay 2.

Flutter:

- Helper de periodo: hoy / semana ISO-lunes / mes / custom → pares `start`/`end` en Mexico City.
- Mensaje vacío y badge de estado (sin filtrar copy técnico).

Dashboard: no hace falta test E2E; el contrato lo cubre el backend.

## 8. Límites de unidades

- `list_dispatch_history` + DTOs: una responsabilidad (query + serialize).
- `AccountScreen` + widgets de periodo/lista: no hinchar `home_screen.dart`.
- `HistoryPage` nueva; drawer de detalle puede extraer filas compartidas con monitor **solo** si no acopla el snapshot en vivo.
