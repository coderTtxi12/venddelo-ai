# Live Menu Haptics — Design Spec

> Status: **Implemented**
> Scope: Menú live (`PublicDigitalMenuPage`) — feedback háptico al agregar al carrito y al seleccionar complementos

## Goal

Dar feedback táctil en móvil cuando el cliente:
1. Pulsa un **producto** en el menú (abre detalle)
2. Pulsa **Agregar al carrito** en la pantalla de producto
3. **Selecciona** un ítem de un grupo de complementos/opciones (no al deseleccionar)

Solo en el menú público en vivo, no en el editor/admin (`DigitalMenuPage`).

## Platform reality

| Plataforma | API web | Permiso al usuario | Resultado |
|------------|---------|-------------------|-----------|
| **Android Chrome / Edge / Samsung Internet** | `navigator.vibrate()` | **No hay prompt** | Vibración ✓ tras tap/click |
| **Android Firefox 129+** | Eliminada / deshabilitada | N/A | No vibra |
| **iPhone / iOS Safari** | Sin Taptic Engine en web | N/A | No vibra |
| **Desktop** | Sin vibrador | N/A | No-op |

### Android — permisos y restricciones (2024–2026)

**No se pide permiso en runtime al usuario.** Chrome en Android no muestra diálogo tipo “¿Permitir vibración?”. El permiso `VIBRATE` del manifest lo declara la app Chrome, no tu sitio web.

Restricciones reales:

1. **User gesture:** `navigator.vibrate()` debe llamarse en el handler de tap/click. Click en complemento o “Agregar al carrito” cumple esto.
2. **Permissions-Policy:** un header `vibrate=()` podría bloquear la API; por defecto es `(self)`. Vercel no lo bloquea.
3. **Ajustes del sistema:** vibración global desactivada o “No molestar” — no hay API fiable para detectarlo.

Para haptics nativos en iOS haría falta un wrapper nativo (Capacitor, React Native, etc.) — fuera de alcance.

## Approaches considered

### A — Vibration API + no-op en iOS (recomendado)

Utilidad pequeña que llama `navigator.vibrate()` solo si existe, respetando `prefers-reduced-motion: reduce`.

**Pros:** Simple, cero dependencias, funciona en Android, no rompe iOS.  
**Cons:** iPhone no vibra.

### B — Vibration + audio click en iOS

Reproducir un sonido muy corto para intentar activar feedback en iOS.

**Pros:** A veces percibido como feedback.  
**Cons:** Puede sonar con el volumen activo; UX inconsistente; no es haptic real.

### C — Wrapper nativo (Capacitor Haptics)

**Pros:** iOS + Android con Taptic Engine real.  
**Cons:** Requiere app nativa/PWA empaquetada; mucho más alcance.

**Recomendación: A**

## Architecture

```
frontend/src/lib/haptics/triggerHaptic.ts   ← utilidad pura, testeable
DigitalMenuProductDetail.tsx                ← prop enableHaptics; dispara en handlers
PublicDigitalMenuPage.tsx                   ← enableHaptics={true}
```

### `triggerHaptic(kind)`

- `'selection'`: pulso único ~12 ms (tap en complemento)
- `'success'`: pulso ~18 ms (agregar al carrito)
- Guard clauses:
  - `typeof window === 'undefined'` → return
  - `prefers-reduced-motion: reduce` → return
  - `'vibrate' in navigator` → else return
  - try/catch → fallo silencioso

### Integration points

1. **`handleOptionToggle`** en `DigitalMenuProductDetail`: vibrar solo si el ítem **pasa a quedar seleccionado** (no al deseleccionar; no si la selección no cambió, p. ej. multi al máximo).
2. **`handleAddToCart`** en `DigitalMenuProductDetail`: vibrar `'success'` cuando `canAdd && onAddToCart` y la acción se ejecuta.

Prop `enableHaptics?: boolean` (default `false`) para no afectar la vista previa del admin.

## Error handling

- Sin permisos o API ausente: no-op, sin logs en producción.
- Solo se invoca dentro de handlers de click (user gesture requerido por la spec de Vibration API).

## Testing

- Unit test de `triggerHaptic`: mock `navigator.vibrate` y `matchMedia`.
- Manual: Android Chrome en menú live — tap complemento y agregar al carrito.

## Out of scope

- Haptics en cantidad +/- del producto
- Haptics al abrir carrito o cambiar categorías
- Capacitor / app nativa iOS
