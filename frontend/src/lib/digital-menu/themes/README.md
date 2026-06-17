# Temas del Menú Digital

Catálogo de **45 temas** para la vista previa del menú digital (incluye colección **Festividades MX**). Generados con la skill **ui-ux-pro-max** (`--design-system`), combinando tipografía, colores, superficies y tokens de layout.

**Almacenamiento:** solo frontend (`frontend/src/lib/digital-menu/themes/`). No se persisten en la base de datos.

## Uso

```ts
import {
  DIGITAL_MENU_THEMES,
  DEFAULT_DIGITAL_MENU_THEME_ID,
  getDigitalMenuThemeOrDefault,
  digitalMenuThemeToStyle,
  loadDigitalMenuThemeFonts,
} from '@/lib/digital-menu/themes';

const theme = getDigitalMenuThemeOrDefault('taqueria-viva');
loadDigitalMenuThemeFonts(theme);

// En el contenedor del teléfono:
<div style={digitalMenuThemeToStyle(theme)} className={styles.phone}>
```

Variables CSS disponibles: `--dm-primary`, `--dm-bg`, `--dm-font-heading`, `--dm-price`, `--dm-price-original`, `--dm-price-sale`, `--dm-discount-badge-bg`, `--dm-discount-badge-text`, etc. (ver `applyTheme.ts`).

---

## Catálogo

| ID | Nombre | Ideal para | Tipografía | Estilo ui-ux-pro-max |
|----|--------|------------|------------|----------------------|
| `original` | Original | Vista neutra por defecto (pre-temas) | System UI | Minimal default |
| `original-verde` | Original Verde | Como Original, categorías en verde delivery (#06C167) | System UI | Minimal default |
| `clasico-rojo` | Clásico Rojo | Restaurante general, comida casera | Playfair Display SC + Karla | Vibrant & Block-based |
| `taqueria-viva` | Taquería Viva | Taquería, antojitos, food truck | Fredoka + Nunito | Vibrant & Block-based |
| `trattoria-roma` | Trattoria Roma | Trattoria, pastas, vino | Playfair Display + Inter | Liquid Glass |
| `sushi-zen` | Sushi Zen | Sushi, ramen, cocina japonesa | Noto Serif JP + Noto Sans JP | Trust & Authority |
| `cafe-artesanal` | Café Artesanal | Cafetería, brunch, panadería | Amatic SC + Cabin | Exaggerated Minimalism |
| `burger-bold` | Burger Bold | Hamburguesas, fast food, wings | Russo One + Chakra Petch | Vibrant & Block-based |
| `ensalada-fresca` | Ensalada Fresca | Bowls, ensaladas, vegan-friendly | Lora + Raleway | Organic Biophilic |
| `fine-dining-oro` | Fine Dining Oro | Alta cocina, chef table | Playfair Display + Inter | Liquid Glass |
| `street-neon` | Street Neon | Street food nocturno, bares | Bebas Neue + Karla | Vibrant & Block-based (dark) |
| `mariscos-costa` | Mariscos Costa | Mariscos, cevichería | Playfair Display SC + Karla | Vibrant & Block-based |
| `pizzeria-napoli` | Pizzería Napoli | Pizza, calzones | Cormorant Garamond + Source Sans 3 | Vibrant & Block-based |
| `pasteleria-dulce` | Pastelería Dulce | Repostería, heladería | Pacifico + Quicksand | Organic Biophilic |
| `korean-bbq` | Korean BBQ | Parrilla coreana | Noto Sans KR | Vibrant & Block-based |
| `curry-india` | Curry India | Comida india | Playfair Display SC + Karla | Vibrant & Block-based |
| `bistro-frances` | Bistro Francés | Bistro francés | Cormorant + Montserrat | Liquid Glass |
| `bbq-humo` | BBQ Humo | Smokehouse | Amatic SC + Cabin | Organic Biophilic |
| `vegan-verde` | Vegan Verde | Plant-based | Fraunces + DM Sans | Organic Biophilic |
| `cava-vino` | Cava y Vino | Wine bar, bodega | Cormorant + Montserrat | Motion-Driven |
| `diner-retro` | Diner Retro | Diner americano | Press Start 2P + VT323 | Retro-Futurism |
| `mediterraneo` | Mediterráneo | Griego, falafel | Cormorant Garamond + Source Sans 3 | Organic Biophilic |
| `thai-vibrante` | Thai Vibrante | Comida tailandesa | Noto Sans Thai | Aurora Gradient |
| `ramen-miso` | Ramen Miso | Ramen, udon | Noto Serif JP + Noto Sans JP | Organic Biophilic |
| `poke-hawaiian` | Poke Hawaiian | Poke bowl | Fredoka + Nunito | Glassmorphism |
| `steak-carbon` | Steak Carbon | Steakhouse (oscuro) | Libre Baskerville + DM Sans | Liquid Glass |
| `dim-sum-china` | Dim Sum China | Comida china | Noto Serif SC + Noto Sans SC | Vibrant & Block-based |
| `ceviche-peru` | Ceviche Perú | Cevichería peruana | Libre Baskerville + Open Sans | Glassmorphism |
| `griego-aegeo` | Griego Egeo | Taverna griega | Literata + Open Sans | Glassmorphism |
| `pho-saigon` | Pho Saigón | Pho vietnamita | Be Vietnam Pro + Noto Sans | Vibrant & Block-based |
| `helado-gelato` | Helado Gelato | Heladería | Baloo 2 + Quicksand | Exaggerated Minimalism |
| `cubano-caribe` | Cubano Caribe | Cocina caribeña | Josefin Sans + Work Sans | Glassmorphism |
| `tex-mex-cantina` | Tex-Mex Cantina | Cantina tex-mex | Fredoka + Nunito | Vibrant & Block-based |
| `food-truck` | Food Truck | Street food diurno | Archivo Black + Roboto | Vibrant & Block-based |
| `granja-organica` | Granja Orgánica | Farm-to-table | Lora + Raleway | Organic Biophilic |
| `lounge-nocturno` | Lounge Nocturno | Bar lounge (oscuro) | Cormorant + Montserrat | Liquid Glass |
| `brunch-dorado` | Brunch Dorado | Brunch / mimosas | Playfair Display + Lato | Glassmorphism |
| `libanes-fenix` | Libanés Fénix | Mezze libanés | EB Garamond + Source Sans 3 | Organic Biophilic |

Tema por defecto: **`original`**.

---

## Festividades México (7 temas)

| ID | Nombre | Celebración | Tipografía |
|----|--------|-------------|------------|
| `septiembre-patrio` | Septiembre Patrio | Mes patrio / bandera | Oswald + Montserrat |
| `grito-independencia` | Grito de Independencia | Noche 15-16 sep (oscuro) | Lexend Mega + Public Sans |
| `dia-muertos` | Día de Muertos | 1-2 Nov | Alfa Slab One + Nunito |
| `mundial-2026` | Mundial 2026 | Copa del Mundo | Barlow Condensed + Barlow |
| `navidad-posadas` | Navidad Posadas | Diciembre | Playfair Display + Lato |
| `cinco-mayo` | Cinco de Mayo | 5 de Mayo | Fredoka + Nunito |
| `revolucion-mx` | Revolución Mexicana | 20 de Nov | EB Garamond + Source Sans 3 |

---

## Qué incluye cada tema

- **Colores:** primary, secondary, accent, background, surface, textos, bordes, categorías, precios (normal, tachado, oferta), badge de promoción, portada, botones flotantes, logo y thumbnails.
- **Tipografía:** fuentes Google, pesos, mood y URL de importación.
- **Estilo:** nombre de estilo ui-ux-pro-max, keywords, radio de tarjetas, estilo de tabs (underline / pill / filled).
- **Metadatos:** `designSystemQuery` — consulta usada con la skill para trazabilidad.

## Próximo paso (UI)

Conectar un selector de tema en `DigitalMenuPage` y reemplazar colores hardcodeados en `DigitalMenuPage.module.css` por variables `--dm-*`.
