# Onboarding del menú digital (`menu_import`)

Guía para dueños de restaurante y desarrolladores que despliegan o mantienen el flujo de importación de menú en Venddelo.

**Spec de diseño:** [`docs/superpowers/specs/2026-07-02-menu-import-onboarding-design.es.md`](../../docs/superpowers/specs/2026-07-02-menu-import-onboarding-design.es.md)

---

## Flujo para el dueño (9 fases)

El asistente guía al owner en español. Cada fase corresponde a uno o más tools del skill `menu_import`:

| # | Fase | Qué hace el owner | Tools del agente |
|---|------|-------------------|------------------|
| 1 | **Bienvenida al onboarding** | Entiende los pasos; responde preguntas iniciales (tipo de cocina, moneda, reglas de promos). | `start_menu_import_session`, `save_discovery_answers` |
| 2 | **Sube tu menú** | Adjunta PDF, DOCX o fotos del menú impreso en el chat. El frontend sube a Storage y el agente registra la ruta. | `register_menu_source_file` |
| 3 | **Revisión del borrador** | El agente extrae categorías, productos, complementos y promos; muestra preguntas sobre reglas ambiguas (`open_questions`). | `start_menu_extraction_batch`, `get_extraction_status`, `preview_import_batch` |
| 4 | **Aclaración de reglas** | Responde dudas (p. ej. “¿la promo 2x1 solo aplica viernes?”). | `save_clarification_answers` |
| 5 | **Fotos de platillos** | Sube fotos de productos; el agente lista los que aún no tienen imagen. | `register_product_image` |
| 6 | **Tema visual** | Elige entre temas del catálogo en base de datos. | `list_menu_themes`, `recommend_menu_theme`, `apply_menu_theme` |
| 7 | **Confirmación por lotes** | Revisa y confirma cada lote (máx. 15 productos); se materializa en el menú digital. | `preview_import_batch`, `apply_menu_batch` (`confirmed: true`) |
| 8 | **Mapeo de fotos** | Asignación automática por visión; el agente pregunta por imágenes dudosas. | `match_photos_to_products`, `resolve_uncertain_image`, `apply_photo_mappings` |
| 9 | **Mejora opcional y cierre** | Mejora de descripciones e imágenes con IA; actualiza el conocimiento del menú. | `preview_description_enhancements`, `apply_description_enhancements`, `request_image_enhancement` (+ skill `menu_media`), `update_menu_knowledge` |

El agente **no aplica mutaciones** al menú hasta que el owner confirme explícitamente (`apply_menu_batch` y `apply_photo_mappings` requieren `confirmed: true`).

---

## Arquitectura de procesamiento

**Importante:** Todo el procesamiento (OCR, extracción, matching de fotos, apply de lotes) corre **en proceso** dentro del mismo servicio FastAPI en Cloud Run. **No hay workers en background** ni colas separadas: cada tool batch ejecuta su loop internamente en el turno del chat y cuenta como **una** iteración de tool del orchestrator.

Implicaciones:

- Extracciones largas (PDF multipágina) bloquean el request HTTP del chat hasta terminar.
- El límite `ASSISTANT_MAX_TOOL_ITERATIONS=32` permite flujos largos sin agotar el orchestrator.
- Tras un deploy, reinicia el backend para cargar código y variables nuevas (ver abajo).

---

## Configuración para desarrolladores

### Migraciones

Aplicar en orden:

```bash
cd backend
.venv/bin/alembic upgrade 0035   # tabla digital_menu_themes
.venv/bin/alembic upgrade 0036   # tabla assistant_menu_import_sessions
```

O en un solo paso: `alembic upgrade head`.

### Catálogo de temas

Los temas del menú digital viven en Postgres (`digital_menu_themes`). El JSON de entrada se genera desde el catálogo TypeScript del frontend.

**1. Exportar desde el frontend:**

```bash
npx tsx frontend/scripts/export-digital-menu-themes.mjs
```

Escribe `backend/data/digital_menu_themes.json`.

**2. Sincronizar a la base de datos:**

```bash
cd backend
.venv/bin/python scripts/sync_digital_menu_themes.py
# o con ruta custom:
.venv/bin/python scripts/sync_digital_menu_themes.py data/digital_menu_themes.json
```

Ejecutar export + sync tras cambios en `frontend/src/lib/digital-menu/themes/`.

### Variables de entorno

En `backend/.env` (ver también `.env.example`):

| Variable | Default | Uso |
|----------|---------|-----|
| `ASSISTANT_MAX_TOOL_ITERATIONS` | `32` | Máximo de tool calls por turno del asistente (flujos de import largos). |
| `OPENAI_VISION_MODEL` | `gpt-5.4-nano-2026-03-17` | Modelo para OCR del menú y matching de fotos. |
| `VISION_PROVIDER` | `openai` | `stub` en tests locales sin API key. |
| `MENU_IMPORT_BATCH_MAX_PRODUCTS` | `15` | Productos por lote al aplicar al menú. |
| `MENU_IMPORT_PHOTO_MATCH_THRESHOLD` | `0.72` | Umbral de confianza para fotos “dudosas”. |
| `OPENAI_API_KEY` | — | Requerida si `VISION_PROVIDER=openai` o `LLM_PROVIDER=openai`. |

### Reinicio tras deploy

Después de desplegar cambios en backend (migraciones, sync de temas, nuevas env vars):

1. Ejecutar migraciones en el entorno destino.
2. Correr `sync_digital_menu_themes.py` si el catálogo de temas cambió.
3. **Reiniciar** la instancia de Cloud Run (o el contenedor local) para que FastAPI cargue configuración y código actualizados.

En local con Docker Compose, recrear el servicio `backend` suele ser suficiente.

---

## Upload de archivos (referencia)

- **Endpoint:** `POST /api/v1/restaurants/{restaurant_id}/assistant/import/assets?kind=menu_source|product_photo`
- **Storage:** `restaurants/{restaurant_id}/import/{kind}/{uuid}.{ext}`
- El chat acepta `attachments[]` con `storage_path` ya subido; el agente valida que la ruta pertenezca al restaurante.

---

## Tests

Flujo E2E con stubs (sin OpenAI real):

```bash
cd backend
.venv/bin/pytest tests/modules/test_menu_import_e2e_stub.py -v
```
