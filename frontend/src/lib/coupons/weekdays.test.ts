import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUPON_WEEKDAY_SHORT,
  formatCouponWeekdaysLabel,
  formatCouponWeekdaysSummary,
  normalizeCouponWeekdays,
  toggleCouponWeekday,
} from './weekdays.ts';

test('toggleCouponWeekday adds and removes days', () => {
  assert.deepEqual(toggleCouponWeekday([], 0), [0]);
  assert.deepEqual(toggleCouponWeekday([0, 2], 0), [2]);
  assert.deepEqual(toggleCouponWeekday([2], 0), [0, 2]);
});

test('normalizeCouponWeekdays sorts and dedupes', () => {
  assert.deepEqual(normalizeCouponWeekdays([2, 0, 2, 9]), [0, 2]);
  assert.equal(normalizeCouponWeekdays([]), null);
  assert.equal(normalizeCouponWeekdays(null), null);
});

test('formatCouponWeekdaysLabel joins weekday names', () => {
  assert.equal(formatCouponWeekdaysLabel([0, 2]), 'Lunes · Miércoles');
  assert.equal(formatCouponWeekdaysLabel(null), null);
});

test('formatCouponWeekdaysSummary', () => {
  assert.equal(formatCouponWeekdaysSummary([0]), 'Solo lunes');
  assert.equal(formatCouponWeekdaysSummary(null), 'Todos los días');
});

test('COUPON_WEEKDAY_SHORT has seven entries', () => {
  assert.equal(COUPON_WEEKDAY_SHORT.length, 7);
});
