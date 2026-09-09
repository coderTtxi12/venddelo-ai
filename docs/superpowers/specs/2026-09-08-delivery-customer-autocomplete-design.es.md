# Autocomplete de clientes en /delivery

## Objetivo

Agilizar el formulario de nuevo envío en el panel del restaurante: al escribir nombre o celular, sugerir clientes del historial (con tolerancia a typos) y, al seleccionar uno, rellenar los campos conocidos del último pedido/envío.

## Alcance

- Autocomplete en **Nombre del cliente** y **Celular** dentro de `RequestDeliveryForm` (`/delivery`).
- Fuzzy match en búsqueda de clientes (`q=`), reutilizado por la página Clientes.
- Snapshot `last_delivery` en activity del cliente para hidratar el formulario.
- Mobile-first, usable en cualquier ancho.
- **Sin commits** en esta entrega (trabajo en la rama actual).

## Fuera de alcance

- Rellenar montos (total a cobrar / billete).
- Autocomplete en otros formularios (cocina, checkout público).
- Nuevas tablas / migraciones de DB.

## Comportamiento UX

1. Con ≥2 caracteres (debounce ~250–300ms), mostrar lista de sugerencias bajo el input activo.
2. Cada fila: nombre, celular formateado, hint opcional de última dirección.
3. Al seleccionar:
   - Pedir activity del `phone_key` (incluye `last_delivery`).
   - Rellenar: nombre, celular, dirección (+ lat/lng/maps), referencias, método de pago, tamaño de paquete, número de paquetes, Listo en (`prep_minutes`).
   - No tocar montos.
   - Si no hay `last_delivery`, solo nombre + celular.
4. Feedback breve no bloqueante (“Cliente cargado”).
5. Teclado: Escape / tap fuera cierra; flechas + Enter navegan; `inputmode` adecuado en celular.
6. Targets táctiles ≥44px; lista scrolleable max-height en móvil.

## Datos

### Búsqueda (existente + fuzzy)

`GET /restaurants/{id}/customers?q=...`

`matches_query` pasa de substring exacto a:

- Normalización sin acentos.
- Match por dígitos en teléfono (parcial).
- Fuzzy de nombre con `difflib.SequenceMatcher` (umbral ~0.7), estilo `menu_read/search.py`.
- Ranking: exactos / substring primero, luego fuzzy por score.

### Snapshot `last_delivery` (nuevo en activity)

`GET /restaurants/{id}/customers/{phone_key}/activity`

Añadir campo opcional:

```ts
last_delivery?: {
  address: string;
  references: string | null;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  payment_method: 'cash' | 'transfer' | 'card_terminal' | null;
  package_size: 'normal' | 'grande' | null;
  package_count: number | null;
  prep_minutes: number | null;
} | null;
```

Fuente preferente: último `DeliveryDispatchRequest` del cliente (manual). Fallback: último evento menú con dirección. Separar referencias de:

- ` · ` (formulario delivery)
- `\nReferencias:` (checkout menú)

`prep_minutes` desde `created_at` → `ready_at` cuando exista.

Mantener `last_delivery_address` / `last_delivery_maps_url` por compatibilidad.

## Arquitectura frontend

- `CustomerSuggestField` (o similar): combobox controlado, lista ARIA, debounce.
- Hook `useCustomerSuggestions(token, restaurantId, query)` → `listRestaurantCustomers`.
- En select: `getRestaurantCustomerActivity` → mapear a setters del form.
- Estilos CSS modules alineados a `RequestDeliveryForm.module.css`.
- Extender `splitDeliveryAddress` (o helper hermano) para el separador ` · `.

## Errores / edge cases

- Sin resultados: no mostrar lista vacía ruidosa (o “Sin coincidencias” discreto).
- Fallo de red en búsqueda: silencioso / no romper el form.
- Fallo al hidratar: mantener texto tipado; toast/error suave.
- `prep_minutes` fuera de opciones del lead-time: usar custom o el valor más cercano válido.
- Cliente solo menú sin coords: dirección texto si hay; pin vacío hasta que el usuario ajuste.

## Tests

- Backend: fuzzy (`marai` → María), dígitos, ranking; `last_delivery` parse refs + payment/package/prep.
- Frontend: split address ` · `; (opcional) mapeo activity → form values.

## Criterios de éxito

- Escribir “guadlupe” sugiere “Guadalupe …”.
- Seleccionar rellena nombre, celular, dirección/refs, pago, paquetes, listo en; montos intactos.
- Funciona bien en ~375px y desktop.
