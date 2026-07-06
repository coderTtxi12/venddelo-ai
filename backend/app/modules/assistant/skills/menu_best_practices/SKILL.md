---
name: menu_best_practices
description: Guía de referencia para calidad del menú digital — estructura, orden de categorías, copy de productos, fotos, complementos, promociones y checklists de auditoría (sin tools). Cárgala cuando el dueño pida optimización o recomendaciones o intente subir muchos productos a la vez; antes de asesorar u optimizar, lee el menú con menu_read y combina esos datos con esta guía.
---

# menu_best_practices

**Guía de mejores prácticas para menús digitales**, alineada con estándares de catálogo
probados y adaptada al modelo de datos de esta plataforma (categorías, productos, complementos,
promociones, branding).

Al emitir recomendaciones, céntrate únicamente en productos, promociones, complementos y demás
ítems que estén activos y visibles en el menú digital—lo que el cliente final puede ver hoy.

**Esta skill no tiene tools.** No lee ni escribe el menú. Úsala como referencia cuando:

- El dueño pida **recomendaciones**, optimizaciones o quiera mejorar su menú.
- Estés a punto de usar **`menu_write`** y quieras criterios de calidad
- Necesites explicar **por qué** una estructura funciona (categorías, complementos, promos).

Para datos en vivo del restaurante, usa la skill **`menu_read`**. Para aplicar cambios, usa **`menu_write`**.
Esta guía te dice *qué* buscar y *cómo* deben verse las cosas; las otras skills ejecutan.

---

## Flujo obligatorio (mejorar / optimizar / editar)

Cuando el dueño quiera **mejorar, optimizar, recomendar, auditar** cualquier elemento
del menú, sigue este orden **antes** de proponer o aplicar cambios:

```
1. load_skill(menu_best_practices)   ← esta guía (si no se cargó en este turno)
2. tools de menu_read                ← categorías, productos, complementos y promos en vivo;
                                      céntrate en lo que el cliente final ve (nombres, fotos,
                                      descripciones, precios publicados, complementos), no en metadatos internos
3. Recomendar o previsualizar        ← combina guía + datos reales
4. menu_write (opcional)             ← solo después de confirmación del dueño
```

### Qué implica realmente "leer el menú"

Para una **auditoría completa**, lee el panorama entero — no un subconjunto.

**Regla estricta — sin afirmaciones sin leer.** Nunca digas que un producto no tiene foto, tiene
complementos vacíos, mala descripción o precio incorrecto a menos que un resultado de `menu_read`
**en este turno** lo muestre. Leer solo categorías + promociones y luego hablar de productos,
fotos o complementos es inventar datos — prohibido. Si aún no leíste productos, léelos antes de
la auditoría (o dile al dueño que aún necesitas revisarlos).

---

## BEST PRACTICES TO ORGANICE OR CREATE YOUR DIGITAL MENU:

## Impacto

Un menú digital con **fotos, nombres completos y descripciones** puede
**aumentar la conversión hasta ~90%**. Una foto atractiva **duplica** la probabilidad de compra.
Los clientes deciden por lo que ven y leen — no por el menú físico.

Traducción operativa para el agente:

| Señal del menú | Efecto esperado |
|----------------|-----------------|
| Producto sin foto | Muchos menos clics y eventos de agregar al carrito |
| Nombre vago ("Combo especial") | Abandono / confusión |
| Descripción vacía o genérica | Menos confianza, más tickets de soporte |
| Categorías desordenadas o demasiadas | Fatiga de decisión |
| Sin complementos en platillos principales | Ticket promedio más bajo |
| Precio distinto al de la tienda física | Malas reseñas y cancelaciones |

---

## Cuándo activar esta skill

| Intención del dueño | Qué hacer |
|---------------------|-----------|
| "¿Cómo optimizo mi menú?" / "dame tips" | Activa esta skill → responde con recomendaciones concretas |
| "Revisa mi menú" / "¿qué me falta?" | Activa **`menu_read`** + esta skill → audita contra el checklist |
| "Mejora descripciones / fotos / orden" | Activa **`menu_read`**, **`menu_write`** y esta skill → propone cambios alineados |
| "¿Cómo configuro un 2×1 / promo?" | Esta skill (reglas) + **`menu_read`** (estado) + **`load_skill(promotions)`** + **`create_promotion`** |

Responde al dueño en **español**, con markdown claro.

---

## Mapa: conceptos de catálogo → este sistema

| Concepto de menú delivery | En Venddelo | Tools típicas |
|---------------------------|-------------|---------------|
| Pasillo / categoría | `categories` (`name`, `sort_index`, `display_layout`, `is_active`) | `list_categories`, `create_category`, `reorder_categories`, `update_category` |
| Producto / platillo | `products` (`name`, `description`, `price_cents`, `image_path`, M:N categories) | `list_products`, `get_product`, `create_product`, `update_product` |
| Grupo de complementos | `option_groups` (`title`, `required`, `selection`, `min/max_selections`) | `add_option_group`, `update_option_group` |
| Complemento / opción | `option_items` (`label`, `price_delta_cents`, `is_active`) | `add_option_item`, `update_option_item` |
| Promo de marketing (2×1, banner) | `promotions` type `bundle` (NxM), scope product/category | `create_promotion`, `set_promotion_targets` (`load_skill(promotions)`) |
| Descuento en producto | `promotions` type `percent` / `amount` (`is_catalog_discount`) | Admin UI / `apply_product_discount` (pendiente en agente) |
| Badge visual, sin cálculo | `promotions` type `combo` (`priced_in_cart=false`) | `create_promotion` |
| Logo / portada / tema | branding de `restaurants` | `menu_write` `list_menu_themes`, `apply_menu_theme` |
| "Apagar" un producto | `is_active=false` (nunca eliminar) | `set_product_active`, `update_option_*` |
| Fotos | `image_path` en producto/categoría/promo | Fotos subidas: `assign_product_image` / `bulk_assign_product_images` (menu_write); generación IA: `generate_product_image` (menu_media) |

---

## 1. Estructura de categorías

### Cantidad y orden

Venddelo recomienda **5–7 categorías intuitivas**, ordenadas por **importancia comercial**:

1. **Promociones** (categoría dedicado — p. ej. "Promociones" u "Ofertas") Por defecto el sistema lo coloca primero y no se pueden reordenar estas categorias especiales.
2. **Entradas** / botanas
3. **Platillos principales** / best sellers
4. **Acompañamientos**
5. **Postres** y **Bebidas** (a veces separados)

En esta plataforma: `reorder_categories` + `sort_index` en cada categoría. Las **primeras dos
categorías** deben tener best sellers y/o productos de mayor ticket — es lo primero que el
cliente ve al hacer scroll.

### Nombres de categoría

| Regla Venddelo | Aplicación |
|----------------|------------|
| Cortos y precisos: "Hamburguesas", "Combos", "Bebidas" | Evita frases largas en el nombre |
| Máx. **~30 caracteres** en la app | Si el nombre es largo, acorta el título y detalla en la descripción de la categoría |
| Sin nombres de categorías duplicados | Una "Bebidas", una "Promos" |
| Mín. **3 productos** por categoría normal | Categoría de promos: mín. **1** producto |

**Mal:** "Todas las hamburguesas + papas por $199"  
**Bien:** categoría **Promociones** → producto **Combo Hamburguesa + Papas** con descripción clara.

### Categorías especiales del sistema

Por defecto hay dos **categorías virtuales** al inicio del menú — **Promociones** y **Por tiempo
limitado** — que no viven en la tabla `categories` (`__dm_promotions__`, `__dm_limited_time__`)
y **no se pueden reordenar**.

| Categoría | El cliente la ve cuando… |
|-----------|--------------------------|
| **Promociones** (1.er lugar) | Está habilitada y hay al menos una promo de marketing activa con banner (`image_path`) y productos ligados |
| **Por tiempo limitado** (2.º lugar) | Está habilitada y al menos un producto tiene una promo activa (2×1/NxM, %, monto o combo) |

El dueño puede renombrarlas o desactivarlas con `update_category`; el sistema las muestra u
oculta automáticamente según las promos vigentes.

### Layout de categoría

Usa `display_layout` cuando ayude:

- **`list`** — default; muchos items con texto más largo
- **`grid`** — bebidas, postres, items visuales
- **`horizontal`** — carrusel destacado

Ejemplo: categoría Bebidas en **`grid`** mejora el escaneo visual.

---

## 2. Productos: nombre, descripción, precio

### Nombre (máx. ~40 caracteres)

- **Específico y autoexplicativo** — el cliente debe entender el platillo solo con el título.
- **Sin emojis**, sin caracteres especiales innecesarios.
- **Sin precio ni % de descuento** en el nombre (la revisión de catálogo de Venddelo lo rechaza).
- Incluye **tipo de platillo** en el nombre cuando sea ambiguo:
  - Bien: "Hamburguesa de res", "Ensalada verde", "Pizza pepperoni"
  - Mal: "Especial de la casa", "Combo 1"

Si el nombre **no** indica el tipo (p. ej. "La especial"), la **descripción debe hacerlo**.

### Descripción (máx. ~150 caracteres)

Debe ser **objetiva y útil**, no marketing vacío:

| Incluir | Evitar |
|---------|--------|
| Ingredientes principales | "Delicioso", "sabroso", "exquisito" |
| Tamaño / piezas / ml ("12 alitas BBQ", "350 ml") | Repetir precio o "50% off" |
| Qué incluye un combo (cada item + tamaño de bebida) | Relleno subjetivo que desperdicia caracteres |
| Elección obligatoria de complemento cuando aplique | Descripción que contradiga `option_groups` |

**Ejemplos recomendados:**

- "Espagueti, salsa bolognesa, carne molida, parmesano y orégano."
- "12 alitas BBQ con aderezo ranch."
- "Hamburguesa de res 150 g, tomate, cebolla, lechuga, queso cheddar."
- Combo: "Hamburguesa de res 150 g, papas medianas y refresco 400 ml a tu elección."

Si la descripción dice "bebida a tu elección", debe existir un **grupo de complementos
correspondiente** — no listes opciones solo en texto.

### Precio

- **Igual que en la tienda física** (misma moneda/experiencia). En el sistema: entero `price_cents` (MXN).
- El precio base **no incluye** promos; explícalas por separado (`promotions` en `get_product`).
- Subidas bruscas (>10% puede disparar alerta de catálogo) — avisa al dueño antes de un aumento grande.

### Bebidas de marca

Venddelo exige **Marca + variación/sabor + tamaño**:

- Producto: **Coca-Cola Original 350 ml** (categoría Bebidas)
- Descripción: tipo como "Refresco" o "Bebida gaseosa"

**No** uses bebidas sueltas como complememtos excepto en combos donde el cliente **elige**
entre marcas en un grupo "Elige tu bebida". Fuera de combos, cada bebida = su propio **producto**.

---

## 3. Fotografía

Venddelo recomienda que **cada platillo tenga una foto de calidad**. Checklist:

| Criterio | Detalle |
|----------|---------|
| Encuadre | Horizontal; producto **centrado**; **100%** del platillo visible |
| Iluminación | Luz natural; sin flash fuerte; sin sombras duras |
| Fondo | Neutro y **consistente** entre productos de la tienda |
| Presentación | Plato fresco, limpio; sin distracciones |
| Ángulo | ~**45°**, mismo ángulo por categoría cuando sea posible |
| Consistencia | La foto debe coincidir con nombre y descripción |
| Prohibido en la foto | Precios, % de descuento, teléfonos, logo >25% del encuadre, empaque desechable poco apetitoso, contenido inapropiado |

En esta plataforma: si falta `image_path`, ofrece **`generate_product_image`** (skill
**`menu_media`**).

---

## 4. Complementos (grupos y opciones)

En Venddelo, los grupos de complementos = **`option_groups`** + **`option_items`**.

### Cuándo usarlos

- **Siempre que el platillo lo permita** — aumentan el ticket y la claridad. El objetivo es que el cliente tenga toda la información y no necesite contactar al restaurante.
- Tamaños, proteína, salsas, extras, elección de bebida en combos.
- Bebida incluida "a tu elección" → grupo obligatorio con cada marca/tamaño como item separado.

### Configuración recomendada

| Campo | Guía |
|-------|------|
| `title` | Claro: "Tamaño", "Elige tu bebida", "Extras" |
| `required` | `true` cuando el cliente **deba** elegir (tamaño, bebida de combo) |
| `selection` | `single` para una elección; `multi` para varios extras |
| `min_selections` / `max_selections` | Deben reflejar la regla del negocio |
| `price_delta_cents` | $0 para items incluidos; positivo para upsell |
| `is_active` | Desactiva toppings agotados sin eliminar |

### Errores comunes (motivos de rechazo de catálogo)

| Error | Corrección |
|-------|------------|
| Grupo creado **sin items** | Agrega cada opción con `add_option_item` |
| Todas las bebidas en **un** item | Separa: Coca-Cola Original 350 ml; Fanta Naranja 350 ml; … |
| Complemento "Coca-Cola" sin tamaño/marca | Formato completo Marca + variación + ml |
| Descripción dice "a tu elección" pero no hay grupo | Crea el grupo obligatorio correspondiente |
| Bebida suelta vendida como topping | Crea producto en categoría Bebidas |

### Reutilización

Cuando varios productos comparten la misma estructura (p. ej. "Elige tu bebida"), replica el
mismo patrón de grupo/items para consistencia — reutiliza, copia la estructura de un grupo existente
entre productos.

---

## 5. Promociones y descuentos

Este sistema separa **campañas de marketing** de **descuentos de catálogo**. No mezcles conceptos al asesorar.

### NxM / 2×1 (`type: bundle`)

- Pasillo dedicado o productos destacados bajo **Promociones**.
- Requiere banner con **`image_path`** al crear una campaña de marketing.
- Scope **`product`**, **`products`** o **`category`** — no aplica a todo el pedido.
- Explícale al dueño: los complementos de pago **siempre se cobran**; algunos complementos pueden
  **sacar una unidad del 2×1** si están listados como no participantes (`option_participation` en `menu_read`).

### Descuentos percent / amount

- Para "15% off en estos productos" → `apply_product_discount` (sin banner).
- **No** pongas el % en el nombre del producto.

### Badge combo (`type: combo`)

- Etiqueta visual solamente; **no cambia** el total en checkout.
- Útil para paquetes prearmados con precio en `price_cents`.

### Buenas prácticas

- Nombre corto de promo ("2×1 Alitas", "Combo Familiar").
- Targets claros (`set_promotion_targets`).
- Fechas/horario cuando sea temporal (`starts_at`, `ends_at`, schedule).
- Desactiva con `disable_promotion` cuando termine — nunca "eliminar".

---

## 6. Orden dentro de categorías

Venddelo y la investigación de conversión en delivery coinciden:

- **Posiciones 1–3** en cada categoría: best sellers y platillos más rentables.
- **No** uses orden alfabético por default si perjudica ventas.
- Anclaje de precio: mostrar opciones premium primero hace que el resto se sienta razonable.

Tool: `reorder_products` con `category_id` + lista ordenada de `product_ids`.

---

## 7. Branding de la tienda

Logo, portada y descripción del restaurante generan confianza en la vitrina Venddelo.

- **`update_restaurant`**: `name`, `description`, `logo_path`, `cover_path` (tema del menú digital:
  `menu_write` `apply_menu_theme`).
- Consistencia visual entre portada y fotos de productos.
- Activa/desactiva categorías automáticas **Promociones** / **Tiempo limitado** si el dueño usa esos pasillos dinámicos.

---

## 8. Disponibilidad

Venddelo permite a comercios apagar productos/toppings por un día, una semana o indefinidamente.

Aquí: **`set_product_active(false)`** o `update_option_item(is_active=false)` — nunca eliminar.
Dile al dueño que desactive items agotados **antes** de que lleguen pedidos imposibles.

---

## 9. Anti-patrones (resumen)

| Evitar | Hacer en su lugar |
|--------|-------------------|
| "Combo especial" sin detalle | Nombre + descripción itemizada |
| Promo solo en el nombre | Promo en sección Promociones + `create_promotion` |
| 15+ categorías | Consolidar en 5–7 pasillos |
| Productos huérfanos sin categoría | Siempre ≥1 `category_id` al crear |
| Grupo "Extras" vacío o genérico | Items con precio y nombre completo |
| Descuento en el título | `apply_product_discount` |
| Inventar ingredientes | Pregunta al dueño o lee el menú actual |
| Afirmar precio final con promo | Explica base + promo; checkout calcula el total |

---

## Alcance de esta guía

Estas reglas reflejan **estándares de catálogo Venddelo** para categorías, productos, complementos,
fotografía y promociones (`categories`, `products`, `option_groups`, `promotions`,
branding). Cuando una sugerencia genérica choque con los datos en vivo del restaurante, **gana el menú
en vivo** (`menu_read`).
