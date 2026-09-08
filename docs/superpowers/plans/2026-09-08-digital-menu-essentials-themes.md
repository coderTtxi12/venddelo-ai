# Digital Menu Essentials Themes Implementation Plan

> **For agentic workers:** Implement task-by-task. User requested **no commits** and **no new branch**.

**Goal:** Add 15 white-background essentials themes with varied accents and typography.

**Architecture:** New `catalogEssentials.ts` exported into `DIGITAL_MENU_THEMES`; register ids in `themeGroups` + `themeAddSuccess`; optionally refresh `backend/data/digital_menu_themes.json` via existing export script.

**Tech Stack:** TypeScript theme catalog, Google Fonts URLs, existing `DigitalMenuTheme` type.

## Global Constraints

- `background: '#FFFFFF'` on all 15 themes
- Current branch only; no commits
- Harmonious palettes; Approach A typography mix

---

### Task 1: Add `catalogEssentials.ts`

- [ ] Create `frontend/src/lib/digital-menu/themes/catalogEssentials.ts` with all 15 themes matching the approved design

### Task 2: Wire catalog + groups + addSuccess

- [ ] Import/spread in `catalog.ts`
- [ ] Add 15 ids to `ESSENTIAL_THEME_IDS`
- [ ] Add `THEME_ADD_SUCCESS` entries

### Task 3: Export backend JSON (if script is the source of truth)

- [ ] Run frontend export script so `backend/data/digital_menu_themes.json` includes the new themes

### Task 4: Verify

- [ ] Typecheck / quick grep that all 15 ids are registered in group + addSuccess
- [ ] Confirm every theme has `background: '#FFFFFF'`
