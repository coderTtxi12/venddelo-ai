# Planning del Proyecto — Vendelo AI (Del inicio al despliegue)

> Plan de ejecución de punta a punta para construir Vendelo AI desde cero hasta producción. Operacionaliza `PROJECT_CONTEXT.es.md` (qué/por qué) y `TECH_ARCHITECTURE.es.md` (cómo) en **fases, hitos, tareas y entregables**.
>
> Reglas de oro para cada tarea: seguir **SOLID**, seguir la skill **`superpowers`**, respetar los límites del **monolito modular**, todo cambio de esquema vía **Alembic**, y mantener el diseño **agnóstico de la DB** para poder cambiar de base de datos en el futuro.

## 0. Principios guía (aplican a todas las fases)

- **Agnóstico de DB vía SOLID (Inversión de Dependencias).** El dominio/servicios nunca importan SQLAlchemy ni Supabase directamente. Dependen de **interfaces de repositorio** (puertos). Los adaptadores concretos (PostgreSQL/Supabase) las implementan. Cambiar de DB = escribir un nuevo adaptador, sin tocar la lógica de dominio.
- **Capas estilo hexagonal** por módulo: `api` (delgada) → `service` (lógica de dominio) → `repository (puerto)` → `adapter (impl)`. Las llamadas entre módulos pasan por interfaces de servicio, nunca por lectura cruzada de tablas.
- **Contratos primero.** Los DTOs de Pydantic son el contrato estable entre capas y en la superficie de la API.
- **Todo reversible y auditable** (las ediciones de IA guardan original vs optimizado; soft deletes en todo).
- **Definition of Done** de una tarea: código + tipos + tests + migración (si hay esquema) + logging estructurado + nota en docs + pasa lint/CI.

---

## Fase 1 — Cimientos y setup del repo

**Objetivo:** esqueleto del monorepo, herramientas y convenciones listas.

Tareas:
1. Definir layout del monorepo:
   ```
   /backend         (FastAPI, Python)
   /frontend        (Next.js — producto NUEVO, ver Fase 7)
   /frontend-legacy (el dashboard clonado en Vite/Firebase, se conserva como referencia)
   /docs
   /infra           (docker, cloud run, ci)
   ```
2. Bootstrap del backend: Python, FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, `pydantic-settings`.
3. Tooling: `ruff` + `black` + `mypy`, `pytest`, hooks de pre-commit.
4. Configuración por entorno (`pydantic-settings`): sin secretos en el código; `.env.example` versionado.
5. Logging estructurado (JSON, middleware de correlación con request-id).
6. Modelo de error base + manejadores globales de excepciones (forma de error uniforme).
7. Decidir y documentar el estándar de **paginación** (cursor recomendado) y el contrato de **idempotencia**.

**Entregables:** `GET /api/v1/health` corriendo, pipeline de lint/tipos/tests verde en local, logging en JSON.

---

## Fase 2 — Modelado de dominio y diseño de DB (PostgreSQL)

**Objetivo:** traducir el catálogo actual de Firebase/Firestore a un esquema normalizado en PostgreSQL, más los dominios nuevos (onboarding, pedidos, traducciones, artefactos de IA).

### 2.1 Detección de patrones desde el frontend legacy

Fuente de verdad del modelo de producto actual: `frontend-legacy/src/services/db/supplierCatalogTypes.ts` y `FIRESTORE_SCHEMA_SUPPLIERS_CATALOG.md`. Entidades/patrones detectados a portar:

- **Category**: `name`, `description`, `image`, `isActive`, timestamps.
- **Product**: `name`, `description`, `price (MoneyUSD)`, `discountUsd`, `image`, `categoryIds[]` (muchos a muchos), `optionGroups[]`, `approvalStatus`, `isPublished`, `isActive`, timestamps.
- **OptionGroup**: `title`, `required`, `selection: single|multi`, `items[]`, `isActive`.
- **OptionItem**: `label`, `priceDeltaUsd`, `isActive`.
- Transversal: **soft delete** (`isActive`/`deletedAt`), **dinero en centavos**, **timestamps de servidor**, **workflow de aprobación/publicación**.

> Lo que **falta vs el producto objetivo** y hay que agregar: **promociones/campañas de descuento**, **entidad restaurante (tenant) con subdominio + horario + métodos de pago + idioma original**, **pedidos**, **artefactos de IA (undo)**, **traducciones del menú**.

### 2.2 Esquema relacional objetivo (alto nivel)

Normalizar los arreglos embebidos de Firestore en tablas relacionales (dejando abierta la opción de denormalizar un modelo de lectura después):

- `restaurants` (tenant): id, name, address, lat, lng, place_id, logo_path, subdomain (único), color_palette, original_language, status, timestamps, soft-delete.
- `restaurant_schedules`: restaurant_id, service_type (`takeout`|`delivery`), day_of_week, open_time, close_time, manejo de bandera `same_as_takeout`.
- `restaurant_payment_methods`: restaurant_id, method (`cash`|`transfer`|`card_terminal`), service_type (`takeout`|`delivery`), enabled.
- `categories`: id, restaurant_id (FK), name, description, image_path, sort_index, is_active, timestamps.
- `products`: id, restaurant_id (FK), name, description, price_cents, currency, image_path, approval_status, is_published, is_active, timestamps.
- `product_categories`: product_id, category_id (join M:N, regla ≥1 forzada en la capa de servicio).
- `option_groups`: id, product_id (FK), title, required, selection, min/max, sort_index, is_active.
- `option_items`: id, option_group_id (FK), label, price_delta_cents, sort_index, is_active.
- `promotions` (**nuevo**): id, restaurant_id, type (`percent`|`amount`|`combo`|`2x1`...), value, scope (producto/categoría/orden), starts_at, ends_at, conditions (JSONB), is_active.
- `orders`: id, restaurant_id, type (`takeout`|`delivery`), datos del cliente, delivery_address, payment_method, subtotal_cents, total_cents, status, idempotency_key, created_at.
- `order_items`: order_id, snapshot de product_id, snapshot de nombre, qty, unit_price_cents, opciones seleccionadas (snapshot JSONB).
- `ai_artifacts`: entity_type, entity_id, field, original_value, optimized_value, status (`applied`|`reverted`), created_at — habilita el **undo**.
- `menu_translations`: restaurant_id, locale, entity_type, entity_id, field, translated_text, source_hash (para invalidar cache), created_at.
- `idempotency_keys`: key, request_hash, response_snapshot, created_at, expires_at.
- `audit_logs`: actor, action, target, metadata (JSONB), occurred_at (portar el concepto de auditoría existente).

### 2.3 Plan de indexación y rendimiento

- Índice único en `restaurants.subdomain`.
- Índices compuestos: `products(restaurant_id, is_active, is_published)`, `products(restaurant_id, approval_status)`, `orders(restaurant_id, status, created_at)`, `menu_translations(restaurant_id, locale, entity_type, entity_id)`.
- Índices GIN (JSONB) donde consultemos dentro de `conditions`/snapshots.
- Dinero siempre en **centavos enteros**; timestamps `timestamptz` con defaults en DB.

**Entregables:** diagrama ER, primera migración Alembic, script de seed para un restaurante demo.

---

## Fase 3 — Capa de persistencia (repositorios) y conexión a Supabase

**Objetivo:** acceso a datos agnóstico de DB con SOLID.

Tareas:
1. Definir **puertos de repositorio** (interfaces abstractas) por agregado: `RestaurantRepository`, `MenuRepository`, `OrderRepository`, `PromotionRepository`, `TranslationRepository`, `AIArtifactRepository`, `IdempotencyRepository`.
2. Implementar **adaptadores SQLAlchemy** detrás de esos puertos. El código de dominio/servicio importa solo el puerto.
3. Conectar a **Supabase PostgreSQL**: connection string vía settings, **connection pooling** (pool de SQLAlchemy + pooler/PgBouncer de Supabase en modo transacción para Cloud Run).
4. Unit-of-work / manejo de sesión (sesión por request, fronteras de commit/rollback).
5. Centralizar convenciones de soft-delete y timestamps (mixins de modelo base).
6. Storage en Supabase tras una abstracción: `StoragePort` con adaptador Supabase (logos, menús subidos, imágenes optimizadas).

**Nota SOLID:** como los servicios dependen de puertos, migrar de Supabase Postgres a otro Postgres/otra DB después = solo un nuevo adaptador.

**Entregables:** repositorios con tests de integración contra un Postgres desechable (docker), conexión a Supabase verificada.

---

## Fase 4 — Servicios de dominio core y API v1 (catálogo/menú)

**Objetivo:** el corazón CRUD, portado de la lógica legacy pero del lado del servidor y normalizado.

Tareas:
1. Servicio + endpoints de **restaurantes/tenancy** (crear, obtener, actualizar, asignación de subdominio).
2. Servicio + endpoints de **categorías** (CRUD, soft delete, orden).
3. Servicio + endpoints de **productos** (CRUD, categorías M:N con regla ≥1, workflow de aprobación/publicación).
4. Servicio de **grupos/ítems de opciones** (single vs multi, validación min/max).
5. Servicio de **promociones** (nuevo) — la pieza faltante vs legacy.
6. Middleware transversal: **auth (verificación de token Supabase/Google)**, **rate limiting (Redis)**, **idempotencia (Redis + tabla)**, **paginación**, **logging estructurado**.
7. Versionado de API conectado (`/api/v1`), docs OpenAPI.

**Entregables:** CRUD completo del catálogo sobre `/api/v1`, authz por tenant, tests.

---

## Fase 5 — Redis (hot storage) y temas transversales

**Objetivo:** velocidad y seguridad.

Tareas:
1. Adaptador Redis tras un `CachePort` (DIP otra vez).
2. Cachear **menús públicos publicados** por `subdomain` + `locale` (ruta de mucha lectura).
3. Store de idempotency keys con TTL; contadores de rate-limit.
4. Invalidación de cache al escribir menú/producto/promoción.
5. Definir estrategia de TTL por tipo de dato (documentarla).

**Entregables:** lectura del menú público servida desde cache con mejora de latencia medida; idempotencia y rate-limit activos.

---

## Fase 6 — Servicios de IA (extracción, optimización, traducción)

**Objetivo:** el pipeline de IA, cada capacidad tras una interfaz (proveedor intercambiable).

Tareas:
1. Abstracción `AIGatewayPort` con adaptador(es) de proveedor. Sin lock-in de proveedor en el código de dominio.
2. **Extracción de menú (OCR/comprensión de documentos):** subida (foto/PDF/imagen) → borrador estructurado (categorías, productos, precios, opciones, promos, imágenes).
3. **Optimización de imágenes:** mejorar fotos de platillos **sin alterar el platillo real**; guardar original + optimizada en Storage; registrar en `ai_artifacts`.
4. **Copywriting de descripciones:** generar descripciones optimizadas; conservar la original para el **undo**.
5. **Selección de paleta de colores:** elegir de las paletas disponibles según logo/marca.
6. **Servicio de traducción (multiidioma):** al solicitar el menú público, si el locale del dispositivo ≠ `original_language`, traducir y persistir en `menu_translations` + cachear en Redis; política de fallback si el locale no está soportado.
7. Orquestación: jobs asíncronos (extracción/optimización pueden ser largas) con estado que el dashboard pueda consultar/suscribir.

**Entregables:** subir un menú real → borrador de menú autogenerado; traducción ante mismatch de locale; todos los cambios de IA reversibles.

---

## Fase 7 — Frontend (producto NUEVO en Next.js)

> El frontend legacy (clonado en Vite + Firebase) ya contiene la **lógica de producto que un restaurante necesita** (nombre, descripción, opciones/complementos, categorías, aprobación/publicación) — solo falta **promociones**. **Reutilizamos su lógica/patrones de UX** pero reconstruimos en **Next.js + TypeScript** hablando con **nuestra FastAPI**, no con Firebase.

Tareas:
1. Scaffold de Next.js (App Router), design system responsive, cliente de API compartido (tipado, habla con `/api/v1`).
2. **Auth**: Supabase Auth (Google) en el cliente; adjuntar token a las llamadas de API.
3. **Onboarding (tipo Typeform):** nombre, ubicación (Google Places), horario (takeout/delivery, mismo por default + "set different"), métodos de pago (todo palomeado por default), subir logo, subir menú.
4. **Pantalla de procesamiento IA:** mostrar progreso de extracción/optimización; presentar el menú generado.
5. **Dashboard:** editor de menú (CRUD productos/categorías/opciones/**promociones**), **undo de IA** por campo/imagen, pedidos en tiempo real, estadísticas, ganancias.
6. **Flujo de publicación:** asignar subdominio, generar link + QR.
7. **Menú público (subdominio):** UI de pedido responsive, **detección de idioma del dispositivo + traducción por IA**, carrito, datos de envío, método de pago, **envío del pedido a WhatsApp** con el formato de detalle de pedido.
8. Portar lógica reutilizable del legacy (option groups single/multi, aprobación/publicación) a componentes/servicios de Next.js.

**Entregables:** producto usable de punta a punta en staging.

---

## Fase 8 — Realtime, estadísticas y pedidos por WhatsApp

Tareas:
1. Pedidos en tiempo real al dashboard (decidir: Supabase Realtime vs WebSockets/SSE — TBD en el doc de arquitectura).
2. Endpoints de agregación de estadísticas/ganancias (modelos de lectura / vistas materializadas; cachear métricas calientes).
3. Formato de pedido para WhatsApp + handoff (deep link / API) con el formato estandarizado de detalle de pedido.

**Entregables:** pedidos en vivo visibles, métricas mostradas, checkout por WhatsApp funcionando.

---

## Fase 9 — Endurecimiento, pruebas y observabilidad

Tareas:
1. Pirámide de tests: unitarios (servicios), integración (repos/adaptadores), tests de contrato de API, flujos e2e clave.
2. Pasada de seguridad: authz por tenant, ajuste de rate-limit, validación de entradas, higiene de secretos; correr **`superpowers`** + security review.
3. Load test de la ruta de lectura del menú público y de creación de pedidos; verificar pooling/índices.
4. Observabilidad: logs estructurados, tracing de requests, tracking de errores, dashboards/alertas básicos.

**Entregables:** CI verde, checks de seguridad/rendimiento aprobados.

---

## Fase 10 — Dockerización y despliegue (Google Cloud Run)

Tareas:
1. Dockerfiles para backend y frontend (multi-stage, imágenes slim, non-root).
2. `docker-compose` para dev local (api + postgres + redis).
3. **CI/CD** (GitHub Actions): lint → tipos → tests → build → push → deploy a **Cloud Run**; correr **migraciones Alembic** como paso de release.
4. Entornos: dev / staging / prod; secretos vía Secret Manager; settings vía env.
5. Estrategia de subdominios: DNS wildcard + TLS para `*.vendelo.app` ruteando a la app del menú público.
6. Aprovisionamiento de Redis gestionado; proyecto Supabase de prod; backups.
7. Smoke tests post-deploy + plan de rollback.

**Entregables:** producción en Cloud Run, deploys automatizados, migraciones en el pipeline.

---

## Fase 11 — Post-MVP / a prueba de futuro

- **Listo para cambiar de DB:** como todo el acceso está tras puertos de repositorio, validar escribiendo en tests un adaptador alterno desechable.
- **Ruta de extracción a microservicios:** primeros candidatos a separar — `ai` (pesado/asíncrono) y `orders` (escalado independiente). Los límites ya están forzados vía interfaces de servicio.
- Pagos en línea, multi-sucursal, más idiomas, profundidad de analítica, planes/billing.

---

## Checklists transversales

**Definition of Done por tarea**
- [ ] Sigue SOLID; sin dependencia del dominio a DB/proveedor concreto
- [ ] Skill `superpowers` aplicada
- [ ] DTOs Pydantic / contratos tipados
- [ ] Migración Alembic (si hay cambio de esquema)
- [ ] Índices considerados
- [ ] Idempotencia/paginación donde aplique
- [ ] Logging estructurado agregado
- [ ] Tests agregados/actualizados
- [ ] Docs actualizadas

**Hitos sugeridos**
- M1: Esqueleto backend + health + esquema DB + migraciones (Fases 1–2)
- M2: API de catálogo v1 + repositorios + Supabase + Redis (Fases 3–5)
- M3: Pipeline de IA (extracción/optimización/traducción) (Fase 6)
- M4: Producto Next.js (onboarding → dashboard → menú público) (Fases 7–8)
- M5: Endurecimiento + Dockerización + deploy a Cloud Run (Fases 9–10)

## Preguntas abiertas (heredadas de arquitectura)
- ¿Transporte de realtime (Supabase Realtime vs WS/SSE)?
- ¿Estándar de paginación (cursor vs offset) en todo el proyecto?
- ¿Proveedor(es) de IA para OCR/imagen/texto/traducción?
- ¿Idiomas soportados en el MVP + fallback cuando el locale del dispositivo no esté soportado?
- ¿Dominio raíz definitivo + estrategia de subdominio wildcard/certificados?
