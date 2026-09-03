# Promociones (`/promociones`) — Rediseño y nuevos tipos

**Fecha:** 2026-09-02  
**Estado:** Borrador para revisión  
**Reemplaza:** panel `/marketing` (N×M únicamente)

## Resumen

Reinventar el panel de promociones como **`/promociones`**, con el mismo diseño responsive que `/cupones` (métricas, búsqueda, filtros fuera de la tabla, ordenamiento, tabla en escritorio y tarjetas en móvil, sheet lateral para crear/editar).

Ampliar tipos de promoción administrables desde un solo lugar, con **banner en menú en vivo activado por defecto** y toggle para ocultarlo.

## Decisiones acordadas (usuario)

| Tema | Decisión |
|------|----------|
| Descuentos por producto | **Sistema unificado**: crear/editar desde `/promociones` **o** desde el editor de producto; ambos actualizan la misma promo de catálogo (`__product_discount__{producto}`) |
| Combo | **Combo fijo**: deben estar **todos** los productos seleccionados en el carrito para aplicar el beneficio |
| Umbral de carrito + envío gratis | **Nuevo beneficio en promociones** (no delegar a cupones) |
| Ruta | **`/promociones`** con **redirect** permanente `/marketing` → `/promociones` |

## Enfoques considerados

### A. Todo en un solo release (descartado)
- Alto riesgo de regresiones en pricing del menú en vivo y en sync de catálogo.
- Difícil de revisar y probar.

### B. UI primero, motor por fases (**recomendado**)
1. **Fase UI:** `/promociones`, redirect, lista estilo cupones, formulario por “plantilla” reutilizando tipos que ya funcionan (N×M, descuento producto vía catálogo).
2. **Fase motor:** combo con pricing real, umbral de carrito + `free_shipping`, toggle `show_banner`.
3. **Fase unificación:** editor de producto lee/escribe la misma promo; mensajes en checkout cuando no se alcanza umbral.

### C. Motor primero, UI después (descartado)
- El restaurante no ve valor hasta el final; retrasa feedback de UX.

**Se adopta el enfoque B.**

---

## Arquitectura de producto

### Plantillas en el panel (lo que el usuario elige al crear)

| Plantilla | `type` (storage) | `scope` | Beneficio | Banner menú |
|-----------|------------------|---------|-----------|-------------|
| **Descuento en producto** | `percent` \| `amount` | `product` | % o monto fijo | Sí por defecto (`show_banner=true`); catálogo desde producto: `false` |
| **N×M** (actual) | `two_for_one` | `product` \| `category` | lleva N paga M | Sí por defecto |
| **Combo** | `combo` | `product` | % \| monto \| envío gratis | Sí por defecto |
| **Umbral de carrito** | `percent` \| `amount` \| `free_shipping` | `order` | al llegar a `min_order_cents` | Sí por defecto (mensaje en banner; no badge por producto) |

### Campo nuevo: `show_banner`

- **DB:** `promotions.show_banner BOOLEAN NOT NULL DEFAULT true`
- **Regla:** si `show_banner=true` → `image_path` obligatorio (salvo promos de catálogo `__product_discount__`, que siempre `show_banner=false`)
- **Menú en vivo:** `promotionShortcuts.ts` filtra por `show_banner !== false` además de `image_path` y vigencia

### Descuento en producto (unificado)

- Sigue existiendo **una promo por producto** con prefijo `__product_discount__`.
- **Desde producto:** al guardar % o monto, `syncProductCatalogDiscount` crea/actualiza/elimina la promo (sin banner).
- **Desde `/promociones`:** formulario “Descuento en producto” elige producto(s) — para un solo producto, mismo mecanismo de sync; si en el futuro hay varios productos con el mismo %, son promos separadas (una por producto) o una promo `scope=category` (fuera de alcance inicial: **un producto por promo de catálogo**).
- **Lista `/promociones`:** incluye promos de catálogo con etiqueta “Desde producto” o ícono; editar abre el mismo formulario.

### Combo (nuevo pricing)

**Regla:** el carrito debe contener **al menos 1 unidad de cada** `product_id` en `promotion_products` (mínimo 2 productos).

**Beneficio** (uno solo):
- `percent` — descuento % sobre la suma de líneas de los productos del combo (antes de otros descuentos de línea, o después de catálogo — **igual que N×M: después de descuento de catálogo en base**)
- `amount` — descuento fijo en centavos (tope: subtotal del combo)
- `free_shipping` — en pedidos delivery, waived delivery fee si combo completo (misma semántica que cupón envío gratis)

**Aplicación:** una vez por carrito si se cumple el combo (no stack de múltiples instancias del mismo combo en v1).

### Umbral de carrito (extender motor existente)

- Ya existe `scope=order` + `min_order_cents` + `percent`/`amount` en `pricing.py`.
- **Agregar** `type=free_shipping` a promociones (migración check constraint + `STORAGE_TYPES`).
- En `price_cart` / quote público: si subtotal elegible ≥ `min_order_cents`, aplicar beneficio a nivel pedido.
- **UI checkout:** fila “Promoción …” y mensaje si falta monto para activar (opcional fase 3).

### Banner menú en vivo

- Sin cambio de UX del carrusel N×M actual.
- Promos con `show_banner=true` + imagen + vigencia entran al carrusel.
- Promos `scope=order` (umbral): banner con copy tipo “Envío gratis en pedidos desde $X” generado desde campos de la promo (no requiere productos en `promotion_products`).

---

## UI `/promociones` (paridad con `/cupones`)

### Layout

```
[ Título + subtítulo ]     [ métricas: Total | Activas | Programadas | Con banner ]
[ Búsqueda........................ ] [ + Agregar promoción ]
[ Filtros: Estado | Tipo plantilla | Ordenar (móvil) ] [ Limpiar ]
[ N promociones ]
[ Tabla desktop | Tarjetas móvil ]
[ Paginación — fase UI: cliente como cupones; opcional API page después ]
```

### Métricas

- Total promociones (excl. borradas)
- Activas ahora (`effective_status=active`)
- Programadas
- Con banner visible

### Filtros

- Búsqueda por nombre
- Estado: todas | activas | programadas | expiradas | fuera de horario | inactivas
- Tipo: todas | producto | N×M | combo | umbral
- Orden: más recientes, nombre, vigencia, tipo

### Lista

- Columnas: Nombre, Tipo, Beneficio, Alcance, Vigencia, Banner (sí/no), Estado, Acciones (editar, eliminar)
- Acciones con `IconButton` + `Tooltip` (MUI)
- Sin `display:flex` en `<td>` (wrapper interno)

### Crear / editar

- **Paso 1:** elegir plantilla (4 tarjetas con icono)
- **Paso 2:** formulario específico en `CouponSheet` / `PromotionSheet` (reutilizar patrón de `CouponSheet.tsx`)
- Campos comunes: nombre, fechas, horario recurrente (opcional), imagen banner, **toggle “Mostrar en menú en vivo”** (default on)
- Formularios:
  - `ProductDiscountPromotionForm`
  - `BundlePromotionForm` (refactor de `PromotionForm` actual)
  - `ComboPromotionForm`
  - `CartThresholdPromotionForm`

### Rutas y navegación

| Antes | Después |
|-------|---------|
| `/marketing` | redirect 308 → `/promociones` |
| Sidebar `path: '/marketing'` | `path: '/promociones'` |
| `dashboardSearch` href | `/promociones` |
| `MarketingPage.tsx` | `PromotionsPage.tsx` (nuevo; deprecar página vieja) |

---

## Backend

### Migración

```sql
ALTER TABLE promotions ADD COLUMN show_banner BOOLEAN NOT NULL DEFAULT true;
-- Actualizar promos __product_discount__ → show_banner = false
-- Extender CHECK type para incluir free_shipping (o usar type existente + scope order con benefit enum — preferido: type free_shipping solo scope order)
```

### Archivos principales

| Área | Archivos |
|------|----------|
| Modelo | `backend/app/db/models/promotions.py` |
| Migración | `backend/migrations/versions/00XX_promotion_show_banner_free_shipping.py` |
| Tipos | `backend/app/modules/promotions/types.py` |
| Schemas | `backend/app/modules/promotions/schemas.py` |
| Validación | `backend/app/modules/promotions/service.py` (`image_path` solo si `show_banner`) |
| Pricing combo | `backend/app/modules/promotions/pricing.py` |
| Pricing envío | `backend/app/modules/promotions/pricing.py` + quote en `public/api.py` |
| Tests | `backend/tests/modules/test_promotion_*.py` |

### API

- Sin nuevos endpoints; extender `PromotionCreate` / `PromotionUpdate` / `PromotionDTO` con `show_banner`.
- Listado sigue cursor-paginado; frontend puede pasar a paginación servidor en fase posterior (como `/clientes`).

---

## Frontend

| Área | Archivos |
|------|----------|
| Página | `frontend/src/app/(panel)/promociones/page.tsx` |
| Redirect | `frontend/src/app/(panel)/marketing/page.tsx` → redirect |
| UI | `frontend/src/components/pages/PromotionsPage.tsx`, `.module.css` |
| Forms | `frontend/src/components/promotions/*` |
| Filtros | `frontend/src/lib/promotions/filters.ts` |
| Display | `frontend/src/lib/promotions/display.ts` |
| Banner | `frontend/src/lib/promotions/promotionShortcuts.ts` |
| Catálogo | `frontend/src/lib/promotions/productCatalogDiscount.ts` |
| Tipos API | `frontend/src/lib/api/types.ts`, `promotions.ts` |

---

## Comportamiento en menú en vivo y checkout

1. Cliente carga promos públicas (`GET /public/.../promotions`).
2. Banners: `show_banner && image_path && effective`.
3. Badges en producto: percent/amount/combo/N×M en `scope product|category` (sin cambio de reglas, combo pasa a tener precio real).
4. Quote carrito: aplica líneas + umbral pedido + envío gratis promo.
5. Cupones siguen componiendo después (sin cambio).

---

## Errores y validación

| Caso | Mensaje / acción |
|------|------------------|
| Banner on sin imagen | “Sube una imagen para mostrar la promo en el menú” |
| Combo con &lt; 2 productos | “Selecciona al menos 2 productos para el combo” |
| Umbral sin monto mínimo | “Indica el monto mínimo del carrito” |
| % fuera de 1–100 | Validación igual que cupones |
| Producto con descuento desde promociones y editor | Última escritura gana; misma fila en DB |

---

## Pruebas

### Backend
- Combo: carrito con A+B aplica; solo A no aplica
- Combo free_shipping en delivery
- Umbral: subtotal bajo no aplica; al superar aplica
- `show_banner=false` excluida de shortcuts
- Catálogo: sync bidireccional producto ↔ promo

### Frontend
- Redirect `/marketing`
- Filtros y ordenamiento
- Responsive tabla ↔ tarjetas
- Toggle banner persiste

---

## Fuera de alcance (v1)

- Paginación servidor en lista de promociones (se puede añadir después como `/clientes`)
- Múltiples combos apilables del mismo tipo
- Combo “elige 2 de 5”
- Promos automáticas por categoría completa sin selección explícita
- Facebook marketing agent (`backend/app/modules/marketing/`)

---

## Orden de implementación (plan)

1. Migración + `show_banner` + `free_shipping` type
2. Pricing combo + tests
3. Pricing umbral envío gratis + tests quote
4. `PromotionsPage` UI (lista estilo cupones) + redirect + nav
5. Formularios por plantilla + `PromotionSheet`
6. Unificación catálogo producto ↔ promociones
7. `promotionShortcuts` + checkout copy umbral
8. QA móvil + regresión menú en vivo

---

## Aprobación

Revisar este spec antes de generar el plan de implementación (`docs/superpowers/plans/2026-09-02-promociones-redesign.md`).
