#!/usr/bin/env npx tsx
/**
 * Export frontend digital menu theme catalog to backend JSON for DB sync.
 *
 * Usage (from repo root):
 *   npx tsx frontend/scripts/export-digital-menu-themes.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../../backend/data/digital_menu_themes.json');

const { DIGITAL_MENU_THEMES } = await import('../src/lib/digital-menu/themes/catalog.ts');

const payload = DIGITAL_MENU_THEMES.map((theme, index) => ({
  id: theme.id,
  label: theme.label,
  description: theme.description,
  bestFor: theme.bestFor,
  recommendation: theme.recommendation,
  style_keywords: theme.style?.keywords ?? [],
  is_active: true,
  sort_order: index,
}));

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Exported ${payload.length} theme(s) to ${outputPath}`);
