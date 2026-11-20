import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProductDetailBackTarget } from './productDetailReturn.ts';

test('resolveProductDetailBackTarget returns the promo when opened from a promo list', () => {
  assert.deepEqual(resolveProductDetailBackTarget('promo-1'), {
    kind: 'promotion',
    promotionId: 'promo-1',
  });
});

test('resolveProductDetailBackTarget returns menu when product was not opened from a promo', () => {
  assert.deepEqual(resolveProductDetailBackTarget(null), { kind: 'menu' });
});
