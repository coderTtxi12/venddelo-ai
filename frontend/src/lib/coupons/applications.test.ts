import assert from 'node:assert/strict';
import test from 'node:test';

import type { CouponApplication } from '@/lib/api/types';
import {
  isConfirmedCouponApplication,
  summarizeConfirmedCouponApplications,
} from './applications.ts';

function application(overrides: Partial<CouponApplication> = {}): CouponApplication {
  return {
    order_id: 'order-1',
    customer_name: 'María',
    customer_phone: '+525512345678',
    status: 'pending',
    total_cents: 10_000,
    coupon_discount_cents: 2_000,
    created_at: '2026-01-01T00:00:00Z',
    redeemed: false,
    ...overrides,
  };
}

test('isConfirmedCouponApplication follows redeemed flag', () => {
  assert.equal(isConfirmedCouponApplication(application()), false);
  assert.equal(isConfirmedCouponApplication(application({ redeemed: true })), true);
});

test('summarizeConfirmedCouponApplications ignores pending orders', () => {
  const summary = summarizeConfirmedCouponApplications([
    application({ coupon_discount_cents: 2_000 }),
    application({
      order_id: 'order-2',
      redeemed: true,
      coupon_discount_cents: 1_500,
    }),
  ]);
  assert.equal(summary.uses, 1);
  assert.equal(summary.totalDiscountCents, 1_500);
});
