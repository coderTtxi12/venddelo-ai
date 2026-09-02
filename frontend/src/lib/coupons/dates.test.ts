import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCouponValidityRange, localDateInputValue } from './dates.ts';

test('localDateInputValue returns YYYY-MM-DD', () => {
  assert.equal(localDateInputValue(new Date(2026, 8, 2)), '2026-09-02');
});

test('formatCouponValidityRange', () => {
  assert.match(formatCouponValidityRange('2026-09-01', '2026-09-30'), /2026/);
  assert.match(formatCouponValidityRange('2026-09-01', null), /^Desde /);
  assert.match(formatCouponValidityRange(null, '2026-09-30'), /^Hasta /);
  assert.equal(formatCouponValidityRange(null, null), 'Sin caducidad');
});
