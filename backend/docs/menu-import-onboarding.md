# Onboarding del menú digital (`menu_import`) — Concierge

Guía para dueños de restaurante y desarrolladores.

**Spec:** [`docs/superpowers/specs/2026-07-06-menu-import-concierge-redesign.es.md`](../../docs/superpowers/specs/2026-07-06-menu-import-concierge-redesign.es.md)

---

## Flujo concierge (~3 mensajes del dueño si el menú es claro)

| # | Fase | Owner | Tools |
|---|------|-------|-------|
| 1 | Sube menú | PDF/DOCX/fotos en chat | `start_menu_import_session`, `register_menu_source_file` |
| 2 | Extracción + discovery | Responde dudas si hay `open_questions` | `start_menu_extraction_batch`, `save_clarification_answers` |
| 3 | Optimización + preview | Lee propuesta única (incluye complementos obligatorio/opcional) | `optimize_import_draft`, `preview_full_import` |
| 4 | Publicar | Confirma una vez | `apply_full_import`, `apply_menu_theme`, `generate_promotion_banner` (NxM) |
| 5 | Fotos | Sube fotos de platillos | `bulk_assign_product_images` |
| 6 | Cierre | — | `update_menu_knowledge` |

**Skills al inicio:** `menu_write` + `menu_best_practices` + `menu_import`.

**Prohibido en import:** `menu_media`, `generate_product_image`, `request_image_enhancement`.

---

## Complementos (obligatorio / opcional / min-max)

Dos capas:

1. **Extracción OCR** — infiere del texto impreso; si ambiguo → `open_questions`.
2. **Optimización** — LLM + heurísticas (`complement_heuristics.py`):
   - Tamaño → obligatorio, single, min=1, max=1
   - Extras/Adicionales → opcional, multi, min=0
   - Precios extra (`price_delta_mxn`) cuando el menú muestra "+$"

El preview (`preview_full_import`) lista cada grupo con obligatorio/opcional y min/max.

---

## Arquitectura

OCR, optimización y apply corren **en proceso** en el turno del chat (sin workers background).

- `apply_full_import` aplica todos los lotes internos en **una** tool call.
- Límite: `MENU_IMPORT_FULL_MAX_PRODUCTS=200` (default).

---

## Configuración

### Migraciones

```bash
cd backend
.venv/bin/alembic upgrade head
```

### Variables

| Variable | Default | Uso |
|----------|---------|-----|
| `ASSISTANT_MAX_TOOL_ITERATIONS` | `32` | Tool calls por turno |
| `MENU_IMPORT_FULL_MAX_PRODUCTS` | `200` | Máx. productos en apply full |
| `MENU_IMPORT_BATCH_MAX_PRODUCTS` | `15` | Partición interna post-extracción |
| `MENU_IMPORT_PHOTO_MATCH_THRESHOLD` | `0.72` | Match de fotos |
| `OPENAI_VISION_MODEL` | `gpt-5.4-nano-2026-03-17` | OCR |

### Temas

```bash
npx tsx frontend/scripts/export-digital-menu-themes.mjs
cd backend && .venv/bin/python scripts/sync_digital_menu_themes.py
```

---

## Tests

```bash
cd backend
.venv/bin/pytest tests/modules/test_menu_import_*.py -v
```
