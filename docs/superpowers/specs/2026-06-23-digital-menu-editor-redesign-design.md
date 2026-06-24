# Digital Menu Editor Redesign — Design Spec

> Status: **Implemented**
> Scope: Dashboard `/digital-menu` (`DigitalMenuPage`) — vista del dueño del restaurante
> Constraint: **No modificar** el menú live (`PublicDigitalMenuPage` ni sus componentes). Solo **importar y reutilizar** su renderizado; agregar capa de edición encima.

## Goal

Mejorar la vista de Menú Digital del dashboard para que:

1. Muestre cómo se ve el menú en **móvil**, **tablet** y **escritorio** (mismas bandas que el menú live: &lt;768, 768–1023, ≥1024).
2. El contenido visual esté **sincronizado** con el menú live (mismos componentes de categorías, productos, promociones, layouts).
3. Mantenga la **capa de edición**: reordenar categorías, productos, grupos de complementos e ítems de complementos; cambiar tema, portada, logo, nombre; layout por categoría.
4. Facilite elegir entre **~55 temas** con búsqueda y secciones agrupadas.

## Non-goals

- Carrito, checkout, búsqueda, haptics o flujos de compra en el editor.
- Modificar `PublicDigitalMenuPage`, `PublicDesktopMenuLayout`, `DigitalMenuCategorySections` ni CSS del menú público.
- Nuevos endpoints de API.

## Current state

- `DigitalMenuPage` duplica markup del menú público en un frame de teléfono único (~420px).
- Usa `SortableProductList` y drag en tabs de categoría, pero **no** usa `DigitalMenuCategorySections` ni `PublicDesktopMenuLayout`.
- `DigitalMenuThemePicker` muestra todos los temas en scroll horizontal — difícil de navegar con 55 temas.
- Solo vista móvil; tablet/desktop del live no se previsualizan.

## Architecture

```
DigitalMenuPage.tsx                    ← datos, persistencia, orquestación
├── DigitalMenuThemePicker.tsx         ← temas agrupados + búsqueda
├── DigitalMenuSpecialCategoriesPanel  ← sin cambios funcionales
└── DigitalMenuEditorPreview.tsx       ← selector de dispositivo + frame
    ├── DigitalMenuEditorHero.tsx      ← portada/logo/nombre (editable)
    ├── DigitalMenuEditorCategoryBar   ← tabs con drag (móvil/tablet)
    ├── DigitalMenuEditorCategorySections ← reutiliza live + SortableProductList
    ├── DigitalMenuEditorDesktopLayout ← sidebar + main (CSS del live, capa editor)
    └── DigitalMenuProductDetail       ← ya existente, reorder complementos
```

### Sincronización con menú live

| Aspecto | Fuente live reutilizada | Capa editor |
|---------|-------------------------|-------------|
| Categorías especiales / promos | `PromotionShortcutBanners`, `ProductList` | Solo lectura |
| Secciones de categoría | Misma estructura que `DigitalMenuCategorySections` | `SortableProductList`, picker de layout |
| Tabs categorías (móvil/tablet) | Estilos `DigitalMenuPage.module.css` | Drag handles en tabs no especiales |
| Escritorio | `PublicDesktopMenuLayout.module.css` + mismos chips/badge | Nav categorías draggable; grid sortable |
| Detalle producto | `DigitalMenuProductDetail` | `onReorderGroups` / `onReorderItems` |
| Temas / tipografía | `digitalMenuThemeToStyle`, `loadDigitalMenuThemeFonts` | Sin cambio |
| Descuentos / countdown | `buildMenuProductDiscountMap`, `buildProductTimeLimitedPromotionMap` | Igual que live |

## UI layout (dashboard)

### Desktop (≥1024px panel)

- **Columna izquierda** (~360px): tema visual + categorías especiales. Sticky al scroll.
- **Columna derecha** (flex): barra con selector de dispositivo + botón “Ver en vivo”; debajo el frame de preview.

### Mobile dashboard

- Apilar: configuración arriba, preview abajo.
- Selector de dispositivo siempre visible sobre el frame.

### Selector de dispositivo

Tres opciones con iconos MUI:

| Modo | Ancho frame | Clases / layout |
|------|-------------|-----------------|
| Móvil | 390px | `.phone` sin `.publicTablet` |
| Tablet | 820px | `.phone.publicRoot.publicTablet` |
| Escritorio | 100% (max ~1100px) | `DigitalMenuEditorDesktopLayout` |

El frame usa fondo neutro y sombra suave; en escritorio sin bezel de teléfono.

## Theme picker redesign

Agrupar los 55 temas en secciones (metadata en `themeGroups.ts`):

| Grupo | IDs aprox. | Etiqueta UI |
|-------|------------|-------------|
| `essentials` | original, original-verde, clasico-rojo, taqueria-viva | Esenciales |
| `cuisine` | Resto de `catalog.ts` | Por cocina |
| `world` | `catalogExtended` + `catalogExtended2` | Internacional |
| `dark` | `catalogDark` | Modo oscuro |
| `seasonal` | `catalogFestividades` | Festividades MX |

UI:

- Campo de búsqueda (filtra por `name`, `label`, `description`, `bestFor`, keywords).
- Chips de filtro por grupo (multi-select opcional; default “Todos”).
- Grid responsive de tarjetas (3–4 columnas) con swatches y check en seleccionado.
- Tema activo resaltado en header del panel.

## Interacciones de edición (sin cambios de API)

- **Categorías**: drag en tab (móvil/tablet) o ítem sidebar (desktop); persiste `sort_index`.
- **Productos**: `SortableProductList` en todas las vistas; persiste `setCategoryProductOrder`.
- **Layout categoría**: botones vertical / horizontal / grid (solo categorías normales).
- **Complementos**: drag en detalle de producto (ya implementado).
- **Tema**: `PATCH` restaurant `digital_menu_theme_id`.
- **Portada/logo/nombre/descripción**: uploads y blur handlers existentes.

## Error / loading

- Mantener estados actuales de carga y error.
- Preview deshabilitado visualmente mientras `loading`.

## Accessibility

- Selector de dispositivo: `role="tablist"` / `role="tab"`.
- Theme picker: `role="listbox"` / `role="option"`, búsqueda con `aria-label`.
- Drag handles con `aria-label` descriptivos (ya existentes).
- `prefers-reduced-motion`: sin animaciones de frame.

## Files to add / modify

**Add:**

- `frontend/src/lib/digital-menu/themes/themeGroups.ts`
- `frontend/src/components/digital-menu/DigitalMenuEditorPreview.tsx`
- `frontend/src/components/digital-menu/DigitalMenuEditorPreview.module.css`
- `frontend/src/components/digital-menu/DigitalMenuEditorHero.tsx`
- `frontend/src/components/digital-menu/DigitalMenuEditorCategoryBar.tsx`
- `frontend/src/components/digital-menu/DigitalMenuEditorCategorySections.tsx`
- `frontend/src/components/digital-menu/DigitalMenuEditorDesktopLayout.tsx`

**Modify:**

- `frontend/src/components/digital-menu/DigitalMenuThemePicker.tsx`
- `frontend/src/components/digital-menu/DigitalMenuThemePicker.module.css`
- `frontend/src/components/pages/DigitalMenuPage.tsx`
- `frontend/src/components/pages/DigitalMenuPage.module.css`

**Do not modify:** `PublicDigitalMenuPage.tsx`, `PublicDesktopMenuLayout.tsx`, `DigitalMenuCategorySections.tsx`.

## Verification

- `npm run lint` y `npm run build` en `frontend/`.
- Manual: cambiar dispositivo, tema, drag categoría/producto/complemento; “Ver en vivo” abre menú público.
