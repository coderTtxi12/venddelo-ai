# Live Menu Product Image Lightbox — Design Spec

> Status: **Approved**
> Scope: Menú live (`PublicDigitalMenuPage`) — ver imagen de producto a pantalla completa con zoom

## Goal

En la vista de detalle de producto del menú público, permitir que el usuario pulse la imagen del producto y la vea **entera** (sin el crop del hero), con zoom por pinch y doble toque.

Solo en el menú live. **No** en el preview del editor (`DigitalMenuEditorPreview`).

## Context

Hoy `DigitalMenuProductDetail` renderiza el hero con `object-fit: cover` y altura fija (`--dm-cover-height`). La imagen queda recortada y no es interactiva.

El componente se usa en:

| Consumidor | Lightbox |
|------------|----------|
| `PublicDigitalMenuPage` | Sí |
| `DigitalMenuEditorPreview` | No |

## Approaches considered

### A — Lightbox custom con portal + gestos (recomendado)

Overlay en `document.body` vía `createPortal`, gestos pinch / double-tap / pan propios. Sin dependencias nuevas. Alineado con patrones existentes (`PublicMenuSearch`).

### B — Librería (`yet-another-react-lightbox` u otra)

Zoom/pinch listos, pero suma bundle y estilo genérico que habría que tematizar.

### C — MUI Dialog + zoom CSS

Reutiliza MUI, pero el zoom táctil no viene incluido; termina casi custom igual.

**Decisión:** A.

## Design

### Trigger

- Solo si existe imagen real (`imageUrl`); el placeholder **no** abre lightbox.
- El hero (o la `<img>`) es clickeable: `cursor-pointer`, `role="button"` o `<button>` accesible, `aria-label` tipo “Ver imagen completa”.
- Hover sutil (opacidad / brillo) sin layout shift (`transition` 150–250ms).
- Focus visible para teclado.

### Lightbox UI

- Portal a `document.body`.
- Fondo oscuro semitransparente; imagen centrada con `object-fit: contain` y `max-width` / `max-height` 100%.
- Botón cerrar (ícono MUI/SVG, no emoji) + Escape + tap en backdrop **solo si zoom === 1**.
- `role="dialog"`, `aria-modal="true"`, `aria-label` con el nombre del producto.
- Focus trap básico; al cerrar, devolver foco al trigger.
- Transición de entrada/salida 200–250ms; si `prefers-reduced-motion: reduce`, sin animación o fade mínimo.

### Zoom (opción B acordada)

| Gesto | Comportamiento |
|-------|----------------|
| Pinch | Zoom ~1×–4× |
| Doble toque / doble click | Alterna 1× ↔ ~2.5× (centrado en el punto del toque) |
| Pan | Solo con zoom > 1; clampa para no perder la imagen |
| Rueda (desktop) | Zoom in/out hacia el cursor |
| Tap backdrop | Cierra solo si zoom === 1 |

Al cerrar el lightbox, resetear escala y pan a 1× / (0,0).

### Integración

- Prop opcional en `DigitalMenuProductDetail`, p.ej. `enableImageLightbox?: boolean`, activada solo desde `PublicDigitalMenuPage`.
- Componente dedicado, p.ej. `ProductImageLightbox`, junto a los de digital-menu.
- Estilos en CSS module propio; tokens `--dm-*` donde encaje, sin imponer paleta nueva ajena al tema del menú.

### Fuera de alcance

- Galería multi-imagen (un producto = una imagen).
- Lightbox en listados / thumbs del menú (solo vista de detalle).
- Editor / preview del admin.
- Librerías de terceros para zoom.

## UX checklist (ui-ux-pro-max)

- [ ] Sin emojis como íconos
- [ ] `cursor-pointer` en el hero clickeable
- [ ] Hover / focus visibles; transiciones 150–300ms
- [ ] `alt` descriptivo (nombre del producto)
- [ ] `aria-label` en controles solo-ícono (cerrar)
- [ ] `prefers-reduced-motion` respetado
- [ ] Responsive 375px–1440px; sin scroll horizontal

## Testing

- Manual: abrir detalle en menú live → tap imagen → contain a pantalla completa → pinch / double-tap / pan → cerrar (X, Escape, backdrop).
- Confirmar que en editor preview el hero **no** abre lightbox.
- Placeholder sin imagen: no clickeable para lightbox.
- Teclado: Tab al trigger, Enter abre, Escape cierra, foco vuelve.
