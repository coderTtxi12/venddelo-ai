# Plan de mejoras de promociones

> Hoja de ruta para completar la lógica de promociones más allá del MVP actual: vigencia en servidor, horarios recurrentes (ej. “miércoles 2×1 en hamburguesas”), descuentos a nivel pedido e integración en checkout.
>
> **Documentos relacionados:** `PROJECT_PLANNING.es.md`, `TECH_ARCHITECTURE.es.md`, `superpowers/specs/2026-06-14-phase-4-domain-services-api-design.md`

---

## 1. Estado actual (jun 2026)

### Lo que ya funciona

| Área | Estado |
|------|--------|
| CRUD backend | Crear, listar, actualizar, eliminar, asociar productos/categorías |
| Panel Marketing | Crear promociones manuales, eliminar |
| Descuentos de catálogo | El editor de producto sincroniza promociones `percent` / `amount` por producto |
| Menú público | `percent` y `amount` con alcance **producto** y **categoría** |
| Rango de fechas opcional | `starts_at` / `ends_at` en Postgres (nullable) |

### Lo incompleto o ausente

| Brecha | Impacto |
|--------|---------|
| **Alcance pedido** (`scope: order`) | Se guarda en DB pero no se aplica en menú ni carrito |
| **Tipo combo** | Solo badge; sin reglas de precio |
| **Tipo 2×1** | Solo badge; sin matemática 2×1; DB usa `two_for_one`, API usa `2x1` |
| **Horario recurrente** | No hay “todos los miércoles” — solo rango de fechas puntual |
| **Vigencia** | El frontend filtra por fecha al mostrar; el backend devuelve todo lo `is_active` |
| **Estado en admin** | Muestra “Activa” por `is_active`, no por fechas o recurrencia |
| **Checkout / pedidos** | El backend cobra precio de catálogo; promociones no aplicadas en servidor |
| **Editar promoción** | La API tiene PATCH; Marketing solo crea y elimina |

### Ejemplo que **no** funciona de punta a punta hoy

> “Miércoles 2×1 en hamburguesas” — categoría Burgers, tipo 2×1, recurrente los miércoles.

- La selección de categoría funciona a nivel de datos.
- El precio 2×1 no.
- La recurrencia por día de la semana no existe.
- Un 20% puntual en Burgers sí se ve en el menú, pero no si el alcance es **pedido**.

---

## 2. Principios de diseño

1. **El servidor es la fuente de verdad** para “¿esta promoción aplica ahora?” y para precios finales en pedidos.
2. **No confiar en el reloj del cliente** para reglas sensibles (promos vencidas, ventanas recurrentes).
3. **Los cron jobs son opcionales** para UX del panel y limpieza — no el mecanismo principal de enforcement.
4. **Reutilizar patrones** de `restaurant_schedules` (`day_of_week`, franjas horarias, timezone del restaurante).
5. **Entrega por fases** — filtrado de fechas en servidor y descuentos de pedido antes que recurrencia avanzada.

---

## 3. Vigencia: fechas y estado

### Problema

- `ends_at` se guarda pero `is_active` sigue en `true` tras expirar.
- La API pública filtra solo por `is_active`, sin fechas.
- El menú aplica fechas en frontend (`menuProductDiscount.ts`), bypass posible si el celular tiene mal la hora.

### Enfoque recomendado

**Principal: evaluar al leer y al cobrar (reloj del backend + timezone del restaurante).**

```python
def is_promotion_effective(promo, now: datetime, tz: ZoneInfo) -> bool:
    if not promo.is_active:
        return False
    local_now = now.astimezone(tz)
    if promo.starts_at and promo.starts_at > local_now:
        return False
    if promo.ends_at and promo.ends_at <= local_now:
        return False
    if promo.recurrence and not recurrence_matches(promo.recurrence, local_now):
        return False
    return True
```

Aplicar en:

- `PromotionService.list_active` (endpoints autenticados y públicos)
- Servicio de precios de pedido al calcular totales
- Módulo compartido opcional: `app/modules/promotions/effective.py`

**Secundario (opcional): cron para limpieza del panel**

- Job nocturno: soft-delete o marcar promos con `ends_at < now()` y sin recurrencia.
- Objetivo: la tabla Marketing muestre “Expirada” en lugar de “Activa”.
- **No** es necesario para corrección hacia el cliente si existe filtrado al leer.

### Columna de estado en admin

Derivar el estado mostrado con reglas del servidor, no solo `is_active`:

| Mostrar | Regla |
|---------|-------|
| Programada | `starts_at` en el futuro |
| Activa | Efectiva ahora |
| Expirada | Pasó `ends_at` (y sin recurrencia) |
| Inactiva | `is_active = false` (eliminación manual) |

---

## 4. Promociones recurrentes (ej. “todos los miércoles”)

### Casos de uso (por prioridad)

1. Días concretos de la semana — “miércoles 2×1 en Burgers”
2. Días + franja horaria — “viernes 17:00–20:00 happy hour”
3. Rango de fechas puntual — ya soportado con `starts_at` / `ends_at`
4. **Posponer:** “cada N días” — poco uso, UX confusa; omitir en v1

### Propuesta de modelo de datos

Añadir a `promotions` (elegir una opción):

**Opción A — JSONB `recurrence` (flexible, alineado con planning existente)**

```json
{
  "weekdays": [3],
  "start_time": "00:00",
  "end_time": "23:59"
}
```

- `weekdays`: `0–6` (documentar convención; alinear con `restaurant_schedules.day_of_week`).
- `weekdays` vacío o null → sin restricción por día (solo aplican `starts_at` / `ends_at`).
- `start_time` / `end_time` opcionales para ventanas intradía.

**Opción B — tabla `promotion_recurrence` normalizada** — solo si más adelante hay reglas muy complejas.

**Timezone:** timezone del restaurante (añadir `timezone` en `restaurants` si falta; fallback `America/Mexico_City`).

### Lógica de evaluación

- Convertir `now` a hora local del restaurante.
- Si hay `recurrence.weekdays` → `local_now.weekday()` debe estar en la lista.
- Si hay `start_time` / `end_time` → la hora local debe caer en la ventana (ventanas nocturnas después si hace falta).

### Frontend (panel Marketing)

Añadir sección **“Horario”** debajo de fechas inicio/fin opcionales:

| Control | Propósito |
|---------|-----------|
| Modo | **Siempre** (sin filtro por día) / **Días específicos** |
| Multi-select de días | chips L M X J V S D (reutilizar UX del editor de horarios del onboarding) |
| Franja horaria opcional | Desde / Hasta (hora local del restaurante) |
| Texto de ayuda | “Aplica cada día seleccionado dentro de la ventana horaria opcional” |

Mantener **fechas inicio/fin** como límites de campaña (“solo junio–agosto, pero miércoles dentro de ese rango”).

---

## 5. Tipos de promoción — comportamiento completo

### 5.1 Porcentaje / monto (producto y categoría)

**Estado:** casi listo para visualización en menú.

**Pendiente:**

- Mover resolución de descuento al backend o incluir precios calculados en el payload del menú público.
- Mismas reglas al crear el pedido.

### 5.2 Alcance pedido (`scope: order`)

Ejemplo: 10% en todo el pedido si subtotal ≥ MXN 200.

**Reglas:**

- `min_order_cents` ya existe — validar sobre subtotal de líneas, antes del descuento de pedido.
- Una promo de pedido por orden (política v1: **la mejor elegible**, sin apilar).

**UI carrito:**

- Subtotal, línea de descuento de pedido, total.
- Recalcular al cambiar líneas.

**Backend:**

- Tras `OrderService._build_order_items` → paso del motor de promociones.
- Guardar `discount_cents`, `applied_promotion_id` en `orders` (migración).

### 5.3 Dos por uno (`type: two_for_one`)

Unificar nombres: API acepta `2x1`, DB guarda `two_for_one`, DTO mapea de forma consistente.

**Reglas (v1):**

- Alcance: producto o categoría.
- Por línea elegible: cada 2 unidades → pagar 1 (**misma línea de producto, floor(cantidad / 2) unidades gratis**).

**Menú:**

- Badge `2×1`.
- Texto: “Agrega 2 para aplicar la promoción.”

**Carrito / pedido:**

- Ajustar `line_total_cents` en servidor; no confiar solo en precio unitario del cliente.

### 5.4 Combo

**Posponer motor combo** hasta definir reglas de bundles (SKU fijo vs elegir N de un conjunto).

**v1:** ocultar Combo en Marketing o mostrar “próximamente” si se selecciona.

---

## 6. Selección de alcance (productos vs categorías)

| Alcance | Cuándo usar |
|---------|-------------|
| **Categoría** | “Todas las hamburguesas” — checkbox Burgers (UI actual) |
| **Producto** | 2×1 solo en ítems concretos |
| **Pedido** | Descuento al carrito con `min_order_cents` opcional |

Para “miércoles 2×1 en hamburguesas”: **categoría = Burgers**, **tipo = 2×1**, **recurrencia = miércoles**.

---

## 7. Modelo de seguridad

| Amenaza | Mitigación |
|---------|------------|
| Reloj del celular muestra promo vencida | Backend filtra antes de responder; revalida al crear pedido |
| Precios manipulados en carrito | API de pedidos recalcula desde catálogo + motor de promos |
| Abuso directo de API | Rutas admin sin cambio; pedido público usa solo precios de servidor |

Las comprobaciones de fecha en frontend pueden quedar como **optimización de UI**, no como única barrera.

---

## 8. Fases de implementación

### Fase A — Vigencia en servidor (1–2 días)

- [ ] `is_promotion_effective()` compartido en backend
- [ ] Filtrar en `list_active` y endpoint público de promociones
- [ ] UI Marketing: estado derivado (Activa / Programada / Expirada)
- [ ] Tests: timezone, límites de `starts_at` y `ends_at`

### Fase B — Descuentos a nivel pedido (3–5 días)

- [ ] Motor de promociones para alcance pedido (`percent`, `amount`)
- [ ] UI carrito: línea de descuento de pedido
- [ ] Esquema pedido: `discount_cents`, `promotion_id` opcional
- [ ] `OrderService.create_public` aplica promos en servidor
- [ ] Tests: mínimo de pedido, promo expirada rechazada

### Fase C — Horario recurrente (3–4 días)

- [ ] Alembic: `recurrence JSONB` en `promotions` (+ `timezone` en restaurante si falta)
- [ ] Evaluador de recurrencia + tests (miércoles, happy hour)
- [ ] UI Marketing: multi-select de días + franja horaria opcional
- [ ] API pública solo devuelve promos efectivas

### Fase D — Precio 2×1 (3–5 días)

- [ ] Unificar `2x1` / `two_for_one` en API y DB
- [ ] Matemática 2×1 por línea en el motor
- [ ] Badge en menú + hints de cantidad en carrito
- [ ] Snapshot de pedido con desglose 2×1

### Fase E — Pulido admin (2–3 días)

- [ ] Editar promoción (PATCH) en Marketing
- [ ] Cron nocturno opcional para marcar expiradas inactivas
- [ ] Alinear promos automáticas de catálogo con reglas de vigencia

### Fase F — Combo (futuro)

- [ ] Modelo de bundles y reglas de precio combo
- [ ] Habilitar tipo Combo en UI

---

## 9. Bosquejo de API (añadidos)

```yaml
PromotionCreate:
  recurrence:
    weekdays: [3]           # opcional; 0=Lun … 6=Dom (documentar convención)
    start_time: "17:00"     # opcional, hora local del restaurante
    end_time: "20:00"       # opcional

PromotionDTO:
  effective_status: scheduled | active | expired | inactive  # calculado, solo lectura

PublicOrderInput:
  # sin promotion_id del cliente en v1 — servidor elige la mejor promo de pedido
  # o promo_code opcional más adelante para códigos de descuento
```

---

## 10. Checklist de pruebas

- [ ] Promo con `ends_at` pasado → no devuelta por API pública
- [ ] Promo con `starts_at` futuro → estado “Programada”, no aplicada
- [ ] Recurrencia miércoles activa solo miércoles (TZ restaurante)
- [ ] Pedido 10% con `min_order_cents` — bajo umbral: sin descuento; arriba: aplicado
- [ ] 2×1: qty 1 precio completo, qty 2 paga 1, qty 3 paga 2
- [ ] Cliente envía `unit_price_cents` manipulado → API recalcula
- [ ] Promo expirada al crear pedido → 400 con error claro

---

## 11. Fuera de alcance (este plan)

- **Códigos** de descuento (`PRIMERA-COMPRA`) — feature aparte; puede compartir motor después
- Toggle **“Publicar en el menú”** — flag de visibilidad aparte si se necesita
- Límites de uso (`0 / ∞`) — requiere contadores de redención
- Apilar varias promos en una línea — v1: gana el mejor descuento único

---

## 12. Resumen

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cron para desactivar? | Opcional para UX admin; **no** es el enforcement principal |
| ¿Solo validar fecha en frontend? | **Insuficiente** — el reloj del dispositivo puede hacer bypass |
| ¿“Todos los miércoles” en UI? | **Sí** — multi-select de días + hora opcional; reglas en backend |
| ¿“Cada 3 días”? | **Posponer** — complejidad no justificada en v1 |
| ¿Miércoles 2×1 en hamburguesas? | Categoría Burgers + tipo 2×1 + recurrencia miércoles + matemática en carrito/pedido en servidor |
