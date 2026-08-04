# OCR menú → bulk_create_products — Diseño

> **Estado:** aprobado para plan (2026-08-04).  
> **Alcance:** tool de solo lectura `ocr_menu_to_bulk_products` en `MenuWriteSkill` / `catalog_agent`. Extrae productos de imágenes de menú (attachments del chat) al formato `{ items: [...] }` de `bulk_create_products`. Usa `OPENAI_VISION_MODEL`.  
> **Fuera de alcance:** mutar el menú; crear categorías/productos; reutilizar sesiones de `menu_import`; URLs públicas; PDFs multipágina (solo imágenes en inbox).

---

## 1. Objetivo

Permitir que el catalog agent, tras recibir fotos de menú en el chat, llame una tool que devuelva JSON listo para `bulk_create_products`. El agent decide después si crear, partir en batches, o pedir confirmación.

### Decisiones acordadas

| Decisión | Elección |
|----------|----------|
| Comportamiento | Solo extrae y devuelve JSON (no muta) |
| Input | `storage_path`(s) de attachments del chat (inbox) |
| Multi-imagen | Hasta 5 paths; merge de `items` |
| Skill | `MenuWriteSkill` |
| Modelo | `settings.openai_vision_model` (`OPENAI_VISION_MODEL`) |
| Categorías en output | Solo `category_names` (nunca inventar UUIDs) |
| Precio omitido | `price_cents = 0` |

---

## 2. Contexto actual

- `VisionPort.analyze_json` + `OpenAIVisionProvider` ya usan `openai_vision_model`.
- Chat uploads van a `restaurants/{id}/import/inbox/`.
- `bulk_create_products` acepta el shape de salida de esta tool.
- `menu_import` tiene OCR propio con otro schema (`ImportDraft`); no se reutiliza el flujo de sesión.

---

## 3. Arquitectura

```text
catalog_agent
  └─ MenuWriteSkill.ocr_menu_to_bulk_products(storage_paths[])
        ├─ validate path ∈ tenant inbox/assignable prefixes
        ├─ storage.read → bytes + media_type
        ├─ build_vision_provider().analyze_json(
        │     model=OPENAI_VISION_MODEL,
        │     prompt=bulk_products_ocr_prompt,
        │     image_bytes=...
        │   )  # per image, sequential
        ├─ normalize items (name required; aliases; price defaults)
        └─ merge items → ToolResult(data={ items, failed_paths?, model })
```

### 3.1 Archivos

| Unidad | Responsabilidad |
|--------|-----------------|
| `menu_write/ocr_bulk_products.py` | Prompt, OCR loop, normalize, merge |
| `menu_write/tools.py` | ToolDefinition + dispatch |
| `menu_write/SKILL.md` | Cuándo usar OCR → luego bulk_create |
| `tool_catalog.py` | Entrada + return hint |

---

## 4. Contrato de la tool

**Nombre:** `ocr_menu_to_bulk_products`  
**Effect:** `read`

**Args:**
- `storage_paths` (string[], required unless `storage_path`, min 1, max 5)
- `storage_path` (string, optional alias → lista de 1)

**Returns (`ToolResult.data`):**
```json
{
  "items": [ /* same shape as bulk_create_products items */ ],
  "source_count": 2,
  "item_count": 40,
  "failed_paths": [{ "storage_path": "...", "error": "..." }],
  "model": "gpt-4.1-mini"
}
```

`ok=true` si hay al menos un item; si todas las imágenes fallan → `ok=false`.

**Item shape (salida):**
- required: `name`
- optional: `description`, `price_cents` (default 0), `category_names`, `image_path`, `status`, `currency`, `option_groups[]`
- **no** emitir `category_ids` desde OCR

**Option group shape:** igual que bulk create (`title`, `selection`, `required`, `max_selections`, `items[].label` + `price_delta_cents`).

---

## 5. Normalización

- Alias: `pricedeltacents` / `priceDeltaCents` → `price_delta_cents`; `pricecents` → `price_cents`.
- Drop items sin `name`.
- `selection` inválido → `single`.
- `price_cents` / deltas no enteros o negativos → 0 (o drop delta inválido a 0).
- Dedupe opcional al merge: mismo `name.casefold()` + misma primera categoría → conservar el primero.

---

## 6. Prompt (resumen)

Pedir JSON object con clave `items` únicamente. Instrucciones:
- Transcribir productos visibles del menú.
- Precios en centavos (pesos × 100).
- Modelar variantes/tamaños/guisados como `option_groups` con `price_delta_cents` relativos al precio base más bajo.
- Usar `category_names` del encabezado de sección del menú.
- No inventar UUIDs.
- Si un campo no está claro, omitirlo (excepto `name`).

Incluir un ejemplo mínimo del shape en el prompt.

---

## 7. Errores

| Caso | Comportamiento |
|------|----------------|
| 0 paths / >5 | ToolResult ok=false |
| Path inválido (tenant/prefix) | Esa path en `failed_paths`; continuar |
| Storage/Vision error por imagen | `failed_paths`; continuar |
| Respuesta sin items útiles | ok=false summary claro |

---

## 8. Agent guidance (SKILL.md)

Cuando el dueño sube foto(s) de menú para alta masiva:
1. `ocr_menu_to_bulk_products` con los `storage_path` del attachment block.
2. Revisar / partir si `item_count > 50`.
3. Asegurar categorías (`bulk_create_categories` si faltan).
4. `bulk_create_products` con el JSON (o batches).

No usar esta tool para import onboarding de `menu_import`.

---

## 9. Testing

- Stub vision: 1 imagen → items normalizados.
- 2 imágenes → merge.
- Path inválido → failed_paths, otras OK.
- >5 paths → error de tool.
- Alias `pricedeltacents` normalizado.
