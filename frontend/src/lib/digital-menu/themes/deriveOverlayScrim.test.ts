import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOverlayScrim } from './deriveOverlayScrim.ts';

test('resolveOverlayScrim uses the menu background color', () => {
  const scrim = resolveOverlayScrim({
    primary: '#DC2626',
    secondary: '#F87171',
    accent: '#CA8A04',
    background: '#FEF2F2',
    surface: '#FFFFFF',
    text: '#450A0A',
    textMuted: '#7F1D1D',
    textSecondary: '#991B1B',
    border: '#FECACA',
    categoryActive: '#DC2626',
    categoryIndicator: '#DC2626',
    price: '#450A0A',
    priceOriginal: '#991B1B',
    priceSale: '#DC2626',
    discountBadgeBg: '#450A0A',
    discountBadgeText: '#FFFFFF',
    coverPlaceholderFrom: '#FECACA',
    coverPlaceholderTo: '#F87171',
    coverScrim: 'linear-gradient(to top, rgba(69, 10, 10, 0.3), transparent)',
    floatButtonBg: 'rgba(255, 255, 255, 0.92)',
    floatButtonText: '#450A0A',
    logoBorder: '#FFFFFF',
    logoPlaceholderBg: '#FEE2E2',
    productThumbBg: '#FEE2E2',
  });

  assert.match(scrim, /#FEF2F2/);
  assert.doesNotMatch(scrim, /#450A0A/);
});

test('resolveOverlayScrim keeps dark menu backgrounds', () => {
  const scrim = resolveOverlayScrim({
    primary: '#D4AF37',
    secondary: '#A68A2A',
    accent: '#F5D061',
    background: '#000000',
    surface: '#0A0A0A',
    text: '#FAFAFA',
    textMuted: '#D4D4D4',
    textSecondary: '#A3A3A3',
    border: '#1A1A1A',
    categoryActive: '#D4AF37',
    categoryIndicator: '#D4AF37',
    price: '#FAFAFA',
    priceOriginal: '#A3A3A3',
    priceSale: '#F5D061',
    discountBadgeBg: '#141414',
    discountBadgeText: '#F5D061',
    coverPlaceholderFrom: '#3D3520',
    coverPlaceholderTo: '#000000',
    coverScrim: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)',
    floatButtonBg: 'rgba(10, 10, 10, 0.94)',
    floatButtonText: '#FAFAFA',
    logoBorder: '#0A0A0A',
    logoPlaceholderBg: '#171717',
    productThumbBg: '#171717',
  });

  assert.match(scrim, /#000000/);
  assert.doesNotMatch(scrim, /#D4AF37/);
});
