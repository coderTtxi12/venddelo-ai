import assert from 'node:assert/strict';
import test from 'node:test';

import type { Promotion } from '@/lib/api/types';
import { listUnmetOrderThresholdHints, quoteEligibleSubtotalCents } from './orderThresholdHints.ts';
import type { CartQuote } from '@/lib/api/public';

function orderPromo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'promo-1',
    restaurant_id: 'rest-1',
    name: 'Envío gratis',
    image_path: '/img.png',
    type: 'free_shipping',
    scope: 'order',
    percent: null,
    amount_cents: null,
    min_order_cents: 15000,
    starts_at: null,
    ends_at: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    product_ids: [],
    category_ids: [],
    effective_status: 'active',
    ...overrides,
  };
}

test('quoteEligibleSubtotalCents sums priced line totals', () => {
  const quote: CartQuote = {
    server_now: '2026-09-02T12:00:00Z',
    timezone: 'America/Mexico_City',
    lines: [
      {
        product_id: 'p1',
        quantity: 2,
        unit_base_cents: 5000,
        options_cents: 0,
        discount_cents: 0,
        line_total_cents: 10000,
        badge: null,
        applied_promotion_id: null,
      },
    ],
    subtotal_before_discount_cents: 10000,
    order_discount_cents: 0,
    total_cents: 10000,
    applied_order_promotion_id: null,
    coupon: null,
    coupon_error: null,
  };

  assert.equal(quoteEligibleSubtotalCents(quote), 10000);
});

test('listUnmetOrderThresholdHints returns closest free shipping hint', () => {
  const hints = listUnmetOrderThresholdHints(
    [orderPromo()],
    10000,
    new Date('2026-09-02T18:00:00Z'),
    'America/Mexico_City',
    { serviceType: 'delivery' },
  );

  assert.equal(hints.length, 1);
  assert.match(hints[0]!.message, /Agrega \$50\.00 más para envío gratis/);
});

test('listUnmetOrderThresholdHints skips applied free shipping promo', () => {
  const hints = listUnmetOrderThresholdHints(
    [orderPromo()],
    10000,
    new Date('2026-09-02T18:00:00Z'),
    'America/Mexico_City',
    { serviceType: 'delivery', appliedFreeShippingPromotionId: 'promo-1' },
  );

  assert.equal(hints.length, 0);
});
