# Detalles Técnicos y Arquitectura — Vendelo AI

> Documento de referencia técnica. Define el **stack**, los **principios de diseño** y las **prácticas obligatorias** para construir Vendelo AI. Complementa a `PROJECT_CONTEXT.es.md` (qué construimos) describiendo **cómo** lo construimos.

## 1. Resumen de arquitectura

- **Arquitectura inicial: monolito modular.** Empezamos como un monolito, pero el código debe diseñarse para que la **migración futura a microservicios sea sencilla** (módulos con límites claros, bajo acoplamiento, comunicación vía interfaces/servicios, no por acceso directo a tablas ajenas).
- **Despliegue inicial: Google Cloud Run** (contenedores) en producción.
- **Principios SOLID** como base de todo el diseño orientado a objetos/servicios.
- **Best practices obligatorias**: cada cambio debe seguir la skill **superpowers** para aplicar buenas prácticas de forma consistente.

### Diagrama lógico (alto nivel)

```
[ Cliente Web (Next.js) ] <-REST--> [ API FastAPI (v1) ]  ->  [ Servicios de dominio ]
        |               <-WebSocket->        |                          |
   responsive UI               rate limit, auth,           SQLAlchemy + Pydantic
   (cualquier pantalla)        idempotency, paginación            |
        |                              |                   [ PostgreSQL (Supabase) ]
   Supabase Auth (Google)      logging estructurado        [ Redis (hot storage + Pub/Sub) ]
        |                              |                   [ Supabase Storage ]
   Menú público / Dashboard    [ Servicios de IA ]------>  [ AIGatewayPort -> proveedor ]
                               (extracción, imagen,         (OCR, imagen, copy,
                                copy, paleta, traducción)    paleta, traducción)
```

## 2. Frontend

- **Framework**: Next.js + TypeScript.
- **Responsive**: optimizado para funcionar en **cualquier tamaño de pantalla** (mobile-first, breakpoints consistentes, layouts fluidos).
- **Superficies**:
  - **Onboarding** tipo Typeform (paso a paso).
  - **Dashboard** del restaurante (edición de menú, pedidos en tiempo real, estadísticas, ganancias).
  - **Menú público** servido por subdominio (consumo del comensal + checkout vía WhatsApp).
- **Buenas prácticas**: componentes reutilizables, separación de capas (UI / hooks / servicios de API), manejo de estado claro, accesibilidad básica, tipado estricto.

## 3. Backend

- **Lenguaje/Framework**: Python + **FastAPI**.
- **ORM**: **SQLAlchemy**.
- **Validación/serialización**: **Pydantic** (modelos de request/response y settings).
- **Migraciones**: **Alembic**.
- **Base de datos**: **PostgreSQL** (vía Supabase).
- **Auth**: **Supabase Authentication** con **Google** (OAuth/OIDC).
- **Storage**: **Supabase Storage** (logos, imágenes de menú, imágenes optimizadas por IA).
- **Cache / hot storage**: **Redis** (datos calientes: sesiones/menús publicados, contadores, idempotency keys, rate limiting).

### 3.1 Diseño de la API

- **Versionado de API**: rutas con prefijo de versión, `/api/v1/...`, `/api/v2/...` para evolucionar sin romper clientes.
- **Paginación**: en todos los listados (cursor-based preferido para escala; o limit/offset documentado).
- **Idempotencia**: las operaciones (especialmente POST/escrituras como crear pedido) aceptan una **Idempotency-Key**; si el usuario envía la misma petición dos o más veces, la **respuesta debe ser la misma** y no se duplican efectos. Las claves se guardan en Redis (con TTL) + verificación en DB cuando aplica.
- **Logging**: formato de logs **estructurado** (JSON) y consistente, con correlación por request id; niveles claros (info/warn/error) y sin filtrar datos sensibles.

### 3.2 Seguridad y robustez

- **Rate limiting** para prevenir abuso/hacking (por IP/usuario/endpoint), respaldado por Redis.
- **Auth** centralizada en Supabase (Google); verificación de tokens en el backend.
- Validación estricta de entradas con Pydantic; manejo de errores uniforme.

### 3.3 Rendimiento de base de datos

- **Connection pooling**: pool de conexiones para soportar **muchas peticiones concurrentes** sin degradar la latencia.
- **Indexing**: índices en columnas de filtrado/orden frecuentes (claves foráneas, estados de publicación, timestamps, subdominio, etc.).
- **Redis** como capa de lectura caliente para reducir carga sobre PostgreSQL.

### 3.4 Servicios de IA

Toda capacidad de IA vive detrás de una interfaz (`AIGatewayPort`) siguiendo **Inversión de Dependencias**: el dominio no conoce al proveedor concreto, por lo que se puede cambiar/combinar proveedores sin tocar la lógica de negocio.

- **Extracción de menú (OCR / comprensión de documentos)**: convierte el menú subido (foto/PDF/imagen) en un borrador estructurado (categorías, productos, precios, opciones, promociones, imágenes).
- **Optimización de imágenes**: mejora las fotos de platillos **sin alterar el platillo real**; se guardan original + optimizada y se registra en `ai_artifacts` para permitir **undo**.
- **Copywriting de descripciones**: genera descripciones más atractivas; conserva la original para revertir.
- **Selección de paleta de colores**: elige de la lista de paletas disponibles según logo/marca.
- **Traducción (multiidioma)**: cuando el `locale` del dispositivo del comensal ≠ `original_language` del menú, un servicio de IA traduce el contenido visible (categorías, productos, descripciones, complementos, promociones, etiquetas de UI).
  - Las traducciones se **persisten** en `menu_translations` y se **cachean en Redis** (clave por `subdomain` + `locale`) para no retraducir en cada visita.
  - Invalidación por `source_hash` cuando cambia el contenido original; política de **fallback** al idioma original si el locale no está soportado.
- **Orquestación asíncrona**: la extracción/optimización pueden ser largas; se ejecutan como **jobs en background** con estado consultable. El avance se comunica al cliente vía **WebSockets** (ver 3.5).

### 3.5 Realtime (WebSockets)

Algunas superficies requieren actualizaciones en vivo. Para esos casos se usan **WebSockets** (full-duplex), con **SSE/polling** como alternativa donde una sola dirección sea suficiente.

- **Pedidos en tiempo real** en el dashboard del restaurante: cuando entra un pedido nuevo o cambia su estado, se envía por WebSocket a los dashboards suscritos del tenant.
- **Estado de procesamiento de IA**: progreso de extracción/optimización del menú durante el onboarding.
- **Métricas en vivo** (opcional): contadores de ventas/pedidos del día.
- **Diseño**:
  - Canales/rooms por `restaurant_id` para aislar a cada tenant; autenticación del socket con el token de Supabase.
  - Backplane con **Redis Pub/Sub** para que funcione con **múltiples instancias** en Cloud Run (un mensaje publicado por cualquier instancia llega a los sockets conectados en otras).
  - Capa de transporte detrás de una interfaz (`RealtimePort`) para poder cambiar entre WebSockets propios y **Supabase Realtime** sin tocar el dominio.
  - Nota Cloud Run: soporta WebSockets, pero las conexiones son de larga duración con timeout máximo de request; manejar reconexión en el cliente.

## 4. Principios de diseño

### 4.1 SOLID (obligatorio)

- **S — Single Responsibility**: cada módulo/clase con una sola razón de cambio.
- **O — Open/Closed**: extensible sin modificar lo existente (estrategias/inyección).
- **L — Liskov**: las implementaciones respetan los contratos de sus interfaces.
- **I — Interface Segregation**: interfaces pequeñas y específicas.
- **D — Dependency Inversion**: depender de abstracciones, no de implementaciones concretas (repositorios, gateways de IA, storage, etc. detrás de interfaces).

### 4.2 Monolito modular preparado para microservicios

- Organizar el backend por **módulos de dominio** (p. ej. `restaurants`, `menu`, `orders`, `ai`, `realtime`, `auth`, `billing`) con **límites explícitos**.
- Comunicación entre módulos vía **interfaces/servicios**, no por acceso cruzado a tablas.
- Capa de **repositorios** que aísla la persistencia; capa de **servicios** con la lógica de dominio; capa de **API** delgada.
- Evitar dependencias circulares; mantener contratos (DTOs Pydantic) estables.
- Esto permite, en el futuro, **extraer un módulo** (p. ej. `ai` u `orders`) como microservicio con cambios mínimos.

## 5. Infraestructura y despliegue

- **Docker**: contenedores para frontend y backend (imágenes reproducibles).
- **Producción inicial**: **Google Cloud Run** (escalado por contenedor, stateless).
- **Servicios gestionados**: Supabase (PostgreSQL, Auth, Storage), Redis gestionado.
- **Configuración por entorno**: settings con Pydantic; secretos fuera del código.

## 6. Prácticas obligatorias (workflow)

- **Skill `superpowers`**: **cada cambio** debe seguir esta skill para aplicar buenas prácticas (calidad, seguridad, consistencia).
- **Migraciones**: todo cambio de esquema pasa por **Alembic** (nada de cambios manuales en DB).
- **Versionado de API**: cambios incompatibles → nueva versión (`v2`), nunca romper `v1` en uso.
- **Logging estructurado** y trazable en cada request.
- **Tests** y validación antes de desplegar (según política del repo).

## 7. Mapeo requisito → solución

| Requisito | Cómo se cumple |
|-----------|----------------|
| Frontend responsive | Next.js + TS, mobile-first, layouts fluidos |
| API robusta | FastAPI + Pydantic, versionado `v1/v2` |
| Persistencia | SQLAlchemy + PostgreSQL (Supabase) |
| Auth Google | Supabase Authentication |
| Almacenamiento de archivos | Supabase Storage |
| Anti-abuso | Rate limiting (Redis) |
| Migraciones | Alembic |
| Escalabilidad de lecturas | Redis (hot storage) |
| Concurrencia DB | Connection pooling |
| Velocidad de queries | Indexing |
| Resultados consistentes | Idempotency keys |
| Listados grandes | Paginación |
| Observabilidad | Logging estructurado |
| Servicios de IA | `AIGatewayPort` + adaptadores (extracción, imagen, copy, paleta, traducción) |
| Menú multiidioma | Servicio de traducción IA + `menu_translations` + cache Redis |
| Actualizaciones en vivo | WebSockets (+ Redis Pub/Sub backplane); SSE/polling como alternativa |
| Empaquetado | Docker |
| Producción | Google Cloud Run |
| Mantenibilidad | SOLID + monolito modular |
| Evolución | Diseño listo para microservicios |
| Calidad | Skill `superpowers` en cada cambio |

## 8. Preguntas abiertas (por definir)

- ¿Redis gestionado (proveedor) y estrategia de TTL por tipo de dato?
- ¿Estrategia de paginación estándar (cursor vs offset) a nivel de toda la API?
- ¿CI/CD (GitHub Actions → Cloud Run) y entornos (dev/staging/prod)?
- Realtime: se usarán **WebSockets** (con Redis Pub/Sub) para pedidos y estado de IA. Pendiente: ¿WebSockets propios vs **Supabase Realtime** como implementación final detrás de `RealtimePort`?
- ¿Proveedor(es) de IA para OCR/imagen/texto/traducción detrás de `AIGatewayPort`?
- ¿Política de versionado/deprecación de la API (tiempo de soporte de `v1`)?
