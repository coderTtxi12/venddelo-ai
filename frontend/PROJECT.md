## venddelo-ai-frontend

venddelo-ai-frontend es el **dashboard de proveedores (suppliers)** de la startup Tienda Go. Su objetivo es que los suppliers administren su **catálogo de productos** y **inventario**, el cual se vuelve visible en la app móvil **Tienda Go** para que las **convenience stores** puedan visualizar productos y generar **órdenes**. Además, el panel permite a admins y analistas monitorear y operar el ecosistema.

> Nota: el proyecto incluye gran parte del "dashboard panel" (layout, componentes y estructura) porque fue clonado desde GitHub para no empezar desde cero con el diseño y la base del dashboard.

- Las **tienditas de conveniencia** se registran en la app móvil y pueden consultar productos disponibles para generar órdenes.
- Los **proveedores (suppliers)** administran su oferta (catálogo e inventario) y publican esa información para el consumo desde la app.

El panel contempla perfiles del ecosistema: suppliers para mantener su catálogo/inventario y el equipo interno (admins/analistas) para monitorear y operar el marketplace.

### Objetivos del panel

- **Gestionar catálogo e inventario**: alta/edición/publicación de productos y control de disponibilidad para el marketplace.
- **Habilitar operación en la app móvil**: que el inventario publicado sea consultable por las convenience stores y puedan crear órdenes.
- **Monitorear el marketplace**: actividad de tiendas y proveedores, desempeño de productos y categorías.
- **Revisar métricas clave**: ventas, tickets promedio, inventario, pedidos, adopción de funcionalidades.
- **Operación diaria**: alta/baja/edición de proveedores, administración de roles internos, seguimiento de incidencias.
- **Análisis y reporting**: reportes de comportamiento, cohortes de tiendas, rendimiento por proveedor, campañas de marketing.

### Tecnología principal

- **Frontend**: React + TypeScript, empaquetado con Vite.
- **UI**: diseño modular basado en componentes reutilizables (layouts, sidebar, topbar, quick actions, modales).
- **Auth y datos**: Firebase (Authentication + Firestore) como backend-as-a-service.
- **Estilos**: CSS Modules y sistema de tokens con variables CSS para mantener una identidad visual consistente.

### Funcionalidades actuales

- **Login con Google** y **validación en Firestore**: el correo de la cuenta debe existir en `users` con `source: "panel"` y `role` admin o analista (`analyst` / `analista`). Si no aplica, se cierra la sesión y se muestra un mensaje en login. Puede requerirse índice compuesto en `users`: `email` + `source`. Los intentos se registran en `audit_logs` con `action: login`.
- **Dashboard principal** con tarjetas de acciones rápidas, métricas y gráficos de ventas (mock data).
- **Gestión de roles y usuarios internos**:
  - Modal para agregar administradores con guardado en Firestore y reintentos.
  - Validación de duplicados por correo electrónico.
- **Proveedores (página)**: vista alineada a Roles; tarjeta `SupplierQuickActionCard` y modal **Agregar proveedor** (`AddSupplierModal`). Persistencia en Firestore colección **`suppliers`** (`businessName`, `responsibleName`, `email`, `phoneNumber`, `taxId`, `notes`, `addressFormatted`, `latitude`, `longitude`, `placeId`, `photoURL`, `source: "panel"`, `createdAt` / `updatedAt`, `id`). Imagen opcional en **Storage** bajo `supplier-logos/{supplierId}/logo.{ext}`. Ubicación con **Google Places** (opcional, `VITE_GOOGLE_MAPS_API_KEY` + APIs en Google Cloud). Tras un alta correcta se escribe **`audit_logs`** con `action: create`, `targetCollection: suppliers`, resumen *Alta de proveedor desde el panel* y metadatos (`supplierEmail`, `businessName`, etc.). Requiere reglas Firestore/Storage que permitan crear en `suppliers` y subir a `supplier-logos/` solo a usuarios del panel autorizados.
- **Estructura de navegación** para futuras secciones:
  - Órdenes, productos, categorías, proveedores, reseñas, descuentos, analíticas, marketing y configuración.
- **Auditoría (Firestore)**: colección raíz `audit_logs` — eventos create/update/delete/**login**/**logout** con actor, `occurredAt`, recurso afectado y metadatos (incluye altas de proveedores en `suppliers`). Ver `src/services/db/audit.ts`. En producción, define reglas de seguridad para permitir **solo escritura autenticada del panel** y **lectura restringida** a admins.

Este documento sirve como referencia rápida para entender **qué es** venddelo-ai-frontend, a quién sirve y qué problemas busca resolver dentro del ecosistema de la startup.

Sugerencia de mapa de permisos para rol Admin (con “palomita” = permitido)
✅ Proveedores

✅ Ver listado de proveedores
✅ Ver detalle de un proveedor
✅ Crear proveedor
✅ Editar proveedor
✅ Desactivar / reactivar proveedor
✅ Ver historial de pedidos de un proveedor
✅ Tiendas (clientes finales de la app)

✅ Ver listado de tiendas
✅ Ver detalle de una tienda
✅ Ver métricas básicas de la tienda (ventas, tickets, inventario)
✅ Bloquear / desbloquear acceso de una tienda (si aplica a la lógica del producto)
✅ Usuarios internos (panel)

✅ Ver lista de usuarios internos (admins, analistas, etc.)
✅ Crear nuevo admin
✅ Crear nuevo analista
✅ Editar datos básicos de usuarios internos (nombre, rol, estado)
✅ Desactivar / reactivar usuarios internos
✅ Analíticas y reportes

✅ Ver dashboards de métricas globales
✅ Ver reportes por proveedor
✅ Ver reportes por tienda / segmento
✅ Exportar reportes (CSV/Excel/PDF) – cuando exista la feature
✅ Marketplace / catálogo

✅ Ver catálogo global de productos
✅ Ver detalle de producto
✅ Ver relación producto–proveedor
✅ Marcar productos como destacados / recomendados
✅ Operación y soporte

✅ Ver log básico de eventos relevantes (altas/bajas/actualizaciones principales)
✅ Ver y gestionar incidencias / tickets (cuando exista módulo)
✅ Configuración general

✅ Acceder a la sección de configuración del panel
✅ Ajustar parámetros globales básicos (por ejemplo, flags de features internas)
✅ Gestionar parámetros de notificaciones internas (cuando exista módulo)

### Tabla CRUD — rol Admin (módulos)

| Módulo | Leer | Crear | Actualizar | Eliminar |
|--------|:----:|:-----:|:----------:|:--------:|
| Proveedores | ✅ | ✅ | ✅ | ✅ |
| Tiendas (clientes finales de la app) | ✅ | ❌ | ✅ | ✅ |
| Usuarios internos (panel) | ✅ | ✅ | ✅ | ✅ |
| Analíticas y reportes | ✅ | ✅ *(exportar)* | ❌ | ❌ |
| Marketplace / catálogo | ✅ | ✅ | ✅ | ✅ |
| Operación y soporte | ✅ | ✅ | ✅ | ✅ |
| Configuración general | ✅ | ✅ | ✅ | ✅ |
