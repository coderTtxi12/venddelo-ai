# Contexto del Proyecto — Vendelo AI (Menú Digital QR con IA)

> Documento de contexto y referencia rápida. Define **qué** estamos construyendo, **para quién**, y **cómo** funciona el flujo de punta a punta. Sirve como fuente de verdad para alinear producto, diseño e ingeniería.

## 1. Resumen

**Vendelo AI** es una plataforma que permite a restaurantes crear, optimizar y publicar su **menú digital con QR** y recibir **pedidos en línea**, con un fuerte componente de **Inteligencia Artificial** que automatiza el armado y la optimización del menú.

Es conceptualmente similar al **menú digital QR de OlaClick**, pero con matices propios:

- **Onboarding asistido por IA**: el restaurante solo sube su menú (foto/PDF/imagen) y un logo; los **agentes de IA** extraen y arman todo el menú digital automáticamente.
- **Optimización por IA**: mejora de imágenes de platillos (mejor aspecto sin perder los detalles originales) y descripciones más atractivas para el consumidor final.
- **Diseño automático**: la IA elige una **paleta de colores** apropiada de un set de paletas disponibles.
- **Control humano (human-in-the-loop)**: el dueño puede **editar, deshacer (undo) y ajustar** todo lo que hizo la IA.
- **Publicación con subdominio propio** bajo el dominio de Vendelo, con **link** y **código QR** listos para compartir.
- **Pedidos al WhatsApp del restaurante**, con un **formato de detalle de pedido** generado automáticamente (similar a OlaClick).
- **Menú multiidioma**: el menú digital público toma el **idioma del dispositivo** del comensal; si difiere del idioma original del menú, un **servicio de IA del backend** traduce todo el contenido al idioma del dispositivo.

### Diferenciador clave

Mientras herramientas como OlaClick requieren que el dueño cargue/configure el menú manualmente, **Vendelo AI hace el trabajo pesado con IA**: tú subes el menú, la IA lo digitaliza, lo embellece y lo deja listo para publicar. El dueño solo revisa y ajusta.

## 2. Actores / Usuarios

| Actor | Descripción | Dónde opera |
|-------|-------------|-------------|
| **Restaurante (cliente)** | Dueño/administrador del restaurante que crea y gestiona su menú digital. | Onboarding + Dashboard |
| **Comensal (usuario final)** | Persona que ve el menú por QR/link y hace un pedido. | Menú digital público (subdominio) |
| **Equipo Vendelo (interno)** | Admins/analistas que monitorean la plataforma. | Panel interno (existente) |

## 3. Flujo de punta a punta

### Fase 1 — Onboarding del restaurante (formulario tipo Typeform)

Experiencia conversacional, paso a paso (una pregunta a la vez), que captura:

1. **Nombre del restaurante**
2. **Ubicación del restaurante** (dirección; idealmente con Google Places para normalizar y geolocalizar)
3. **Horario del restaurante**
   - **Horario Take out** y **Horario Delivery**
   - **Default:** el mismo horario para ambos
   - Opción: **"Set different schedule for each one"** (definir horario distinto para take out y delivery)
4. **Métodos de pago** (multiselección; **todo palomeado por default**, el negocio puede deseleccionar):
   - Efectivo
   - Transferencia
   - Pago con tarjeta en terminal
   - Nota: el pago con tarjeta en terminal aplica en **dos contextos**: **Take out** y **Delivery** (se configuran por separado)
5. **Subir Logo** (imagen)
6. **Subir Menú** (foto, imagen o PDF del menú actual del restaurante)

### Fase 2 — Procesamiento por agentes de IA

Tras el envío del formulario, los **agentes de IA** ejecutan:

1. **Extracción del menú** desde el archivo subido:
   - Productos
   - Descripciones
   - Precios
   - Complementos / opciones / extras (option groups)
   - Promociones
   - Imágenes
   - Cualquier información útil para llenar el menú digital
2. **Optimización con IA**:
   - **Imágenes**: mejor aspecto/calidad **sin perder los detalles originales** del platillo.
   - **Descripciones**: redacción más atractiva y orientada a conversión para el consumidor final.
3. **Autollenado del menú digital** con la **nueva información optimizada**.
4. **Selección automática de paleta de colores** desde la lista de paletas disponibles (coherente con el logo/marca).
5. **Presentación del menú** generado al usuario para revisión.

### Fase 3 — Revisión, edición y publicación (dashboard del restaurante)

El dueño del restaurante puede:

- **Editar el menú digital**: agregar / editar productos, promociones, imágenes, precios, complementos, etc.
- **Deshacer (undo)** cualquier optimización que la IA haya hecho (volver al original).
- **Publicar/desplegar** su menú digital bajo un **subdominio** del dominio de Vendelo (ej. `mirestaurante.vendelo.app`).
- Obtener su **link** y su **código QR** para compartir/imprimir.
- **Acceder al dashboard** en cualquier momento para:
  - Cambiar/editar su menú digital
  - Ver **pedidos en tiempo real**
  - Ver **estadísticas** y **ganancias**

### Fase 4 — Pedido del comensal (usuario final)

Similar a OlaClick:

1. El comensal abre el menú por **QR o link**.
2. El menú se muestra en el **idioma del dispositivo** del comensal (detectado automáticamente). Si ese idioma es **distinto al idioma original** del menú del restaurante, un **servicio de IA del backend** traduce categorías, productos, descripciones, complementos y promociones al idioma del dispositivo.
3. **Elige productos** (con sus complementos/opciones).
4. Si es **entrega a domicilio**, llena los **datos de envío**.
5. Selecciona **método de pago** (entre los habilitados por el restaurante).
6. El pedido se **envía al WhatsApp del restaurante** con un **formato de detalle de pedido** generado automáticamente (productos, cantidades, extras, total, datos de entrega, método de pago).

## 4. Funcionalidades por IA (resumen)

- **OCR / comprensión de documentos**: lectura de menús en foto/PDF/imagen.
- **Estructuración de datos**: convertir texto desordenado en catálogo (categorías, productos, opciones, precios).
- **Mejora de imágenes**: realce de fotos de platillos preservando detalles originales.
- **Copywriting de descripciones**: descripciones más vendedoras.
- **Diseño automático**: elección de paleta de colores.
- **Human-in-the-loop**: todo lo generado por IA es editable y reversible (undo).
- **Traducción automática (multiidioma)**: servicio de IA en el backend que traduce el menú al idioma del dispositivo del comensal cuando difiere del idioma original.

### Menú multiidioma (comportamiento)

- El restaurante crea y edita su menú en su **idioma original** (detectado al extraer el menú subido o definido en onboarding).
- El **menú digital público** detecta el **idioma del dispositivo** del comensal (p. ej. `Accept-Language`, locale del navegador).
- Si el idioma del dispositivo **coincide** con el idioma original → se muestra el menú tal cual.
- Si el idioma del dispositivo **es diferente** → un **servicio de IA del backend** traduce todo el contenido visible (categorías, nombres de productos, descripciones, complementos, promociones, etiquetas de UI) al idioma del dispositivo.
- Las traducciones se **cachean** (p. ej. Redis) para no retraducir en cada visita.
- El dueño del restaurante **no necesita traducir manualmente**; la IA lo hace bajo demanda. El dashboard sigue mostrando el menú en el idioma original para edición.

## 5. Modelo de datos (alto nivel)

Reutilizamos y extendemos los conceptos ya documentados del catálogo (categorías, productos, *option groups* estilo PedidosYa). Entidades principales:

- **restaurant** (antes "supplier"): nombre, ubicación (dirección + lat/lng + placeId), logo, subdominio, paleta de colores, `originalLanguage` (idioma del menú), estado de publicación.
- **schedule**: horarios separados para `takeout` y `delivery` (con bandera de "mismo horario").
- **paymentMethods**: `cash`, `transfer`, `cardTerminal` (con sub-contexto `takeout` y `delivery`).
- **categories**: nombre, imagen, orden.
- **products**: nombre, descripción (original + optimizada), precio, imagen (original + optimizada), descuentos/promos, `categoryIds`, `optionGroups`.
- **optionGroups / items**: requeridos vs opcionales, single vs multi, `priceDelta`.
- **aiArtifacts** (sugerido): guardar **original vs optimizado** por campo/imagen para permitir **undo** y trazabilidad.
- **menuTranslations** (sugerido): traducciones por idioma (`locale` → contenido traducido por categoría/producto/opción), generadas por el servicio de IA y cacheadas.
- **orders**: items + extras, totales, tipo (`takeout`/`delivery`), datos de envío, método de pago, timestamp, estado.

> Notas de implementación heredadas: dinero en **centavos**, **soft deletes** con `isActive` + `deletedAt`, timestamps con `serverTimestamp()`. Ver `frontend/FIRESTORE_SCHEMA_SUPPLIERS_CATALOG.md`.

## 6. Stack técnico

- **Frontend**: React + TypeScript + Vite. UI por componentes, CSS Modules con tokens de variables CSS.
- **Backend / datos**: Firebase — Authentication, Firestore, Storage.
- **Ubicación**: Google Places API (`VITE_GOOGLE_MAPS_API_KEY`).
- **IA**: agentes/servicios para OCR, estructuración, mejora de imágenes y copywriting (a definir proveedor/orquestación).
- **Publicación**: subdominios bajo el dominio de Vendelo + generación de QR.
- **Mensajería**: integración para envío de pedidos a **WhatsApp** del restaurante.

> El repositorio ya contiene un **panel/dashboard** clonado como base (layout, sidebar, modales, auth con Google validada contra Firestore). Se reutiliza esa base.

## 7. Alcance y supuestos

- El menú subido puede venir en formatos heterogéneos (foto, escaneo, PDF); la IA debe tolerar baja calidad.
- La optimización de imagen **no debe alterar el platillo real** (sin "inventar" comida que no existe).
- Todo cambio de IA debe ser **auditable y reversible**.
- Los pedidos por WhatsApp son el MVP de "checkout"; pagos en línea pueden venir después.
- El menú digital público es **multiidioma**: idioma del dispositivo + traducción automática por IA cuando difiere del idioma original.
- Multi-sucursal queda como evolución futura (no MVP).

## 8. Preguntas abiertas (por definir)

- ¿Proveedor(es) de IA para OCR, imagen y texto? ¿Orquestación propia o servicio?
- ¿Pagos en línea en el menú o solo confirmación por WhatsApp en el MVP?
- ¿Estrategia de subdominios (wildcard DNS, certificados) y dominio raíz definitivo?
- ¿Idiomas soportados en el MVP y política de fallback si el idioma del dispositivo no está soportado?
- ¿Límites del plan gratuito vs planes de pago (modelo de negocio)?
