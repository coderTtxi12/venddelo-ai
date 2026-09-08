# Live menu móvil: document scroll para auto-hide del browser chrome

Fecha: 2026-09-08  
Estado: aprobado (usuario: continuar; constraints: branch actual, sin nueva branch, sin commits)  
Branch de trabajo: el branch actual (sin crear otra branch; sin commits salvo que el usuario lo pida)

## Problema

En iOS Safari y Android Chrome, la barra de URL / chrome del navegador solo se oculta cuando hace scroll el **documento** (o el visual viewport asociado), no cuando el scroll ocurre en un contenedor interno con `overflow-y: auto`.

El live menu público móvil hoy bloquea eso:

- `.phone.publicRoot` / `.mobileFrame`: `height: 100dvh` + `overflow: hidden`
- `.phoneScroll`: scrollport anidado (`overflow-y: auto`, `overscroll-behavior: contain`)
- JS de scroll-spy, hero collapse, `scrollToCategory` y resets apuntan a `mobileScrollRef`

## Objetivo

En el **menú público live, solo móvil**, hacer que el scroll sea del documento para que el browser chrome pueda colapsar al hacer scroll hacia abajo.

## Alcance

**Incluye**

- Ruta pública `/menu/[subdomain]` en layout móvil (y tablet que use el mismo shell móvil de `PublicDigitalMenuPage`)
- CSS del shell público móvil
- Adaptación JS de scroll root / scroll-spy / hero observer / `scrollTo*` en `PublicDigitalMenuPage`

**Excluye**

- Desktop del menú público (`data-layout='desktop'`)
- Preview del editor (`DigitalMenuEditorPreview`) — sigue siendo phone mock con scroll anidado
- Dashboard restaurant owner
- Dashboard delivery
- Onboarding / cocina / monitor
- Cambios de viewport meta salvo que se descubra un bloqueo real al implementar

## Enfoque

Document scroll en móvil público (no hacks de `visualViewport`).

### CSS

1. En `.phone.publicRoot` y `.mobileFrame` (público móvil): dejar de fijar `height/min-height: 100dvh` + `overflow: hidden`. Usar `min-height: 100dvh` (o equivalente) y permitir que el contenido haga crecer el documento.
2. En `.phoneScroll` del menú público móvil: dejar de ser scrollport (`overflow: visible`, sin `min-height: 0` / flex height lock de scroll interno).
3. `.compactHeader`: de `position: absolute` a `position: sticky; top: 0` en el flujo público móvil, para que siga visible al scrollear el documento (hoy depende del frame viewport-locked).
4. `.categoryBar` ya es `sticky`; debe seguir funcionando al quitar `overflow: hidden` del ancestro.
5. Overlays (cart bar fija, search, checkout sheets): sin cambio — mantienen scroll interno propio.

Desktop y editor preview: sin cambio de shell.

### JS

1. Introducir una abstracción mínima de scroll root: elemento anidado **o** viewport/documento (`window` + `document.documentElement`).
2. Extender helpers en `categoryScrollSpy.ts` y `useCategoryScrollSpy` para ese modo (offsets, near-bottom, listener en `window`, IntersectionObserver con `root: null` cuando el scroll es del documento).
3. En `PublicDigitalMenuPage` (móvil):
   - `scrollY` / hero collapse desde `window.scrollY`
   - reset al cambiar restaurante / abrir producto / promo / cart → `window.scrollTo({ top: 0 })`
   - `scrollToCategory` usando coordenadas del documento
   - hero sentinel observer con `root: null`
4. Desktop y `DigitalMenuEditorPreview`: siguen con refs de contenedor anidado.

### Tests

- Unit tests de helpers de scroll (offsets / anchor) con modo documento vs elemento.
- Smoke manual en iOS Safari y Android Chrome: al scrollear el menú, la barra de URL se oculta; category bar + compact header sticky; abrir producto/promo/cart resetea scroll; scroll-spy de categorías sigue correcto.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Compact header se va con el scroll si sigue `absolute` | Cambiar a `sticky` en público móvil |
| Sticky roto por ancestro con `overflow: hidden` | Quitar ese overflow del shell público móvil |
| Scroll-spy / category jump desfasados | Abstracción única de scroll root + tests de helpers |
| Body scroll lock de overlays interactúa mal | Conservar locks solo en overlays; no bloquear body en la lista principal |
| Preview del editor afectado por CSS compartido | Scopear overrides a clases/selectores públicos (`.publicRoot` / `.mobileFrame`), no al `.phone` genérico del editor |

## Criterios de éxito

1. En móvil, scrollear el live menu hace colapsar el chrome del navegador (comportamiento nativo).
2. Category tabs sticky + compact header al colapsar hero siguen usable.
3. Scroll a categoría, spy activo y opens de detalle/cart no regresan.
4. Desktop público y preview del editor sin regresión visual/funcional.
5. Sin commits ni nueva branch en esta tarea salvo petición explícita del usuario.
