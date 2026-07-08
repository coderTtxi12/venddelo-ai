import assert from 'node:assert/strict';
import test from 'node:test';

import { digitalMenuThemeToCssVars } from './applyTheme';
import { DARK_DIGITAL_MENU_THEMES } from './catalogDark';
import { DIGITAL_MENU_THEMES } from './catalog';
import { resolveUnavailableTokens } from './deriveUnavailable';

test('resolveUnavailableTokens derives muted surfaces from theme colors', () => {
  const lightTheme = DIGITAL_MENU_THEMES[0];
  const darkTheme = DARK_DIGITAL_MENU_THEMES[0];

  const light = resolveUnavailableTokens(lightTheme);
  const dark = resolveUnavailableTokens(darkTheme);

  assert.match(light.noticeBg, new RegExp(lightTheme.colors.textMuted.replace('#', '#?')));
  assert.match(light.noticeBg, new RegExp(lightTheme.colors.surface.replace('#', '#?')));
  assert.equal(light.badgeText, lightTheme.colors.textMuted);

  assert.match(dark.noticeBg, new RegExp(darkTheme.colors.textMuted.replace('#', '#?')));
  assert.match(dark.noticeBg, new RegExp(darkTheme.colors.surface.replace('#', '#?')));
  assert.equal(dark.badgeText, darkTheme.colors.textMuted);
  assert.doesNotMatch(dark.noticeBg, /#f8fafc/i);
  assert.doesNotMatch(dark.soldOutBg, /#f8fafc/i);
});

test('digitalMenuThemeToCssVars exposes unavailable tokens for dark themes', () => {
  const darkTheme = DARK_DIGITAL_MENU_THEMES[0];
  const vars = digitalMenuThemeToCssVars(darkTheme);

  assert.match(String(vars['--dm-unavailable-notice-bg']), new RegExp(darkTheme.colors.surface));
  assert.equal(vars['--dm-unavailable-badge-text'], darkTheme.colors.textMuted);
  assert.match(String(vars['--dm-unavailable-sold-out-bg']), new RegExp(darkTheme.colors.surface));
});
