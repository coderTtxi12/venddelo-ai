import assert from 'node:assert/strict';
import test from 'node:test';

import type { Coupon } from '@/lib/api/types';
import { filterCoupons, sortCoupons } from './filters.ts';

function sampleCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    restaurant_id: '22222222-2222-2222-2222-222222222222',
    code: 'SAVE10',
    name: 'Diez pesos',
    type: 'amount',
    percent: null,
    amount_cents: 1000,
    scope: 'all',
    stock_qty: 10,
    expires_on: '2026-12-31',
    is_active: true,
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    product_ids: [],
    category_ids: [],
    redeemed_count: 2,
    remaining_qty: 8,
    effective_status: 'active',
    ...overrides,
  };
}

test('filterCoupons matches code and name', () => {
  const coupons = [
    sampleCoupon(),
    sampleCoupon({
      id: '33333333-3333-3333-3333-333333333333',
      code: 'PIZZA20',
      name: 'Pizza promo',
      effective_status: 'expired',
      type: 'percent',
    }),
  ];
  const filtered = filterCoupons(coupons, {
    query: 'pizza',
    status: 'all',
    type: 'all',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.code, 'PIZZA20');
});

test('sortCoupons orders by uses descending', () => {
  const coupons = [
    sampleCoupon({ code: 'LOW', redeemed_count: 1 }),
    sampleCoupon({
      id: '44444444-4444-4444-4444-444444444444',
      code: 'HIGH',
      redeemed_count: 9,
    }),
  ];
  const sorted = sortCoupons(coupons, 'uses', 'desc');
  assert.deepEqual(sorted.map((coupon) => coupon.code), ['HIGH', 'LOW']);
});
