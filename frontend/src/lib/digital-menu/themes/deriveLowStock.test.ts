import assert from 'node:assert/strict';
import test from 'node:test';

import { digitalMenuThemeToCssVars } from './applyTheme';
import { DARK_DIGITAL_MENU_THEMES } from './catalogDark';
import { DIGITAL_MENU_THEMES } from './catalog';
import { LOW_STOCK_URGENCY_HUE, resolveLowStockTokens } from './deriveLowStock';

test('resolveLowStockTokens blends warm urgency into theme surface', () => {
  const lightTheme = DIGITAL_MENU_THEMES[0];
  const darkTheme = DARK_DIGITAL_MENU_THEMES[0];

  const light = resolveLowStockTokens(lightTheme);
  const dark = resolveLowStockTokens(darkTheme);

  assert.equal(light.accent, LOW_STOCK_URGENCY_HUE);
  assert.match(light.badgeBg, new RegExp(LOW_STOCK_URGENCY_HUE.replace('#', '#?')));
  assert.match(light.badgeBg, new RegExp(lightTheme.colors.surface.replace('#', '#?')));
  assert.equal(light.badgeText, '#C2410C');

  assert.equal(dark.accent, LOW_STOCK_URGENCY_HUE);
  assert.match(dark.badgeBg, new RegExp(darkTheme.colors.surface.replace('#', '#?')));
  assert.equal(dark.badgeText, '#FB923C');
  assert.doesNotMatch(dark.badgeText, /#64748b/i);
});

test('digitalMenuThemeToCssVars exposes low-stock urgency tokens', () => {
  const darkTheme = DARK_DIGITAL_MENU_THEMES[0];
  const vars = digitalMenuThemeToCssVars(darkTheme);

  assert.equal(vars['--dm-low-stock-accent'], LOW_STOCK_URGENCY_HUE);
  assert.equal(vars['--dm-low-stock-badge-text'], '#FB923C');
  assert.match(String(vars['--dm-low-stock-badge-bg']), new RegExp(darkTheme.colors.surface));
});
