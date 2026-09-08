# Design: 15 Essential Digital Menu Themes

**Date:** 2026-09-08  
**Branch:** current (no new branch, no commits)

## Goal

Add 15 new themes to the **Esenciales** group in the restaurant-owner `/digital-menu` theme picker. They share the Original theme’s page background (`#FFFFFF`) and vary everything else: accents, surfaces, text, borders, and typography.

## Constraints

- `colors.background` must be `#FFFFFF` on all 15 themes.
- Palettes must be internally harmonious (primary/secondary/accent/text/border share a clear hue family).
- Typography: Approach A — mix of soft/rounded extra-bold (image reference) and clean/editorial pairings from ui-ux-pro-max.
- Essentials remain venue-agnostic (not cuisine-locked).
- Implementation only touches theme catalog plumbing; no unrelated UI refactors.
- Work on the current branch; do not create commits unless requested.

## Themes

### Soft / rounded bold (6)

| id | name | accent vibe | heading / body |
|----|------|-------------|----------------|
| soft-order | Soft Order | coral + charcoal | Nunito 900 / DM Sans |
| bubble-mint | Bubble Mint | mint | Fredoka / Nunito |
| peach-soft | Peach Soft | peach rose | Varela Round / Nunito Sans |
| berry-soft | Berry Soft | berry magenta | Nunito 800 / DM Sans |
| sky-soft | Sky Soft | sky blue | Baloo 2 / Quicksand |
| citrus-soft | Citrus Soft | citrus lime | Fredoka / Nunito |

### Clean / geometric (5)

| id | name | accent vibe | heading / body |
|----|------|-------------|----------------|
| ink-blue | Ink Blue | trust blue | Outfit / Work Sans |
| forest-clean | Forest Clean | forest green | Poppins / Open Sans |
| amber-pulse | Amber Pulse | delivery orange | Outfit / Work Sans |
| slate-indigo | Slate Indigo | indigo | Poppins / Open Sans |
| teal-trust | Teal Trust | teal | Outfit / Work Sans |

### Editorial / contemporary (4)

| id | name | accent vibe | heading / body |
|----|------|-------------|----------------|
| editorial-ink | Editorial Ink | ink + gold | Playfair Display / Karla |
| rose-neutral | Rose Neutral | dusty rose | Lora / Raleway |
| graphite-lime | Graphite Lime | graphite + lime | DM Sans / Inter |
| copper-modern | Copper Modern | copper | Manrope / Source Sans 3 |

## Plumbing

- New catalog module: `frontend/src/lib/digital-menu/themes/catalogEssentials.ts`
- Spread into `DIGITAL_MENU_THEMES` in `catalog.ts`
- Register all 15 ids in `ESSENTIAL_THEME_IDS` (`themeGroups.ts`)
- Add `THEME_ADD_SUCCESS` entries for each id
- Full `DigitalMenuTheme` tokens (colors, typography, style, context, recommendation)

## Out of scope

- New git branch / commits
- Changing Original / Original Verde / Clásico Rojo
- Backend persistence changes beyond optional theme export if already used

## Self-review

- No placeholders left in theme ids/names.
- No contradiction with “white background only conserved.”
- Scope limited to essentials theme catalog.
