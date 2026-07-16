/**
 * Exports frontend DIGITAL_MENU_THEMES catalog to backend/data/digital_menu_themes.json
 * for Postgres sync (colors + typography included).
 *
 * Usage: pnpm run export:digital-menu-themes
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DIGITAL_MENU_THEMES } from '../src/lib/digital-menu/themes/catalog';
import type { DigitalMenuTheme } from '../src/lib/digital-menu/themes/types';

type BackendThemeEntry = {
  id: string;
  label: string;
  description: string;
  bestFor: string[];
  recommendation: string;
  style_keywords: string[];
  colors: Record<string, string>;
  typography: {
    heading_font: string;
    body_font: string;
    heading_weight: number;
    body_weight: number;
    google_fonts_url: string;
    mood: string;
  };
  is_active: boolean;
  sort_order: number;
};

function toBackendEntry(theme: DigitalMenuTheme, sortOrder: number): BackendThemeEntry {
  const { typography, colors, style } = theme;
  return {
    id: theme.id,
    label: theme.label,
    description: theme.description,
    bestFor: theme.bestFor,
    recommendation: theme.recommendation,
    style_keywords: style.keywords,
    colors: { ...colors },
    typography: {
      heading_font: typography.headingFont,
      body_font: typography.bodyFont,
      heading_weight: typography.headingWeight,
      body_weight: typography.bodyWeight,
      google_fonts_url: typography.googleFontsUrl,
      mood: typography.mood,
    },
    is_active: true,
    sort_order: sortOrder,
  };
}

const outputPath = resolve(__dirname, '../../backend/data/digital_menu_themes.json');
const payload = DIGITAL_MENU_THEMES.map((theme, index) => toBackendEntry(theme, index));

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
console.log(`Exported ${payload.length} theme(s) to ${outputPath}`);
