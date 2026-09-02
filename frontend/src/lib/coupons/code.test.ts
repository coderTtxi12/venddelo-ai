import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCouponCodeInput, normalizeCouponCodeForApi } from './code.ts';

test('formatCouponCodeInput removes spaces and uppercases', () => {
  assert.equal(formatCouponCodeInput('  pizza20 '), 'PIZZA20');
  assert.equal(formatCouponCodeInput('pi zza 20'), 'PIZZA20');
  assert.equal(formatCouponCodeInput('save 10'), 'SAVE10');
});

test('normalizeCouponCodeForApi returns undefined for empty', () => {
  assert.equal(normalizeCouponCodeForApi('   '), undefined);
  assert.equal(normalizeCouponCodeForApi(null), undefined);
});
