import assert from 'node:assert/strict';
import test from 'node:test';

import type { CartQuote } from '@/lib/api/public';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import {
  formatQuoteCouponWhatsAppLines,
  formatQuotePromotionWhatsAppLines,
  formatWhatsAppOrderMessage,
} from './formatWhatsAppOrderMessage.ts';

const baseQuote: CartQuote = {
  server_now: '2026-09-02T12:00:00Z',
  timezone: 'America/Mexico_City',
  lines: [],
  subtotal_before_discount_cents: 10000,
  order_discount_cents: 0,
  total_cents: 8000,
  applied_order_promotion_id: null,
  applied_free_shipping_promotion_id: null,
  delivery_fee_cents: 0,
  coupon: {
    code: 'PIZZA20',
    type: 'percent',
    discount_cents: 2000,
    waived_delivery_cents: 0,
  },
  coupon_error: null,
};

test('formatQuoteCouponWhatsAppLines includes discount amount', () => {
  assert.deepEqual(formatQuoteCouponWhatsAppLines(baseQuote.coupon, 'MXN'), [
    'Cupón PIZZA20: -$20.00',
  ]);
});

test('formatQuotePromotionWhatsAppLines includes free shipping promo', () => {
  assert.deepEqual(
    formatQuotePromotionWhatsAppLines(
      {
        id: 'promo-1',
        restaurant_id: 'rest-1',
        name: 'Envío gratis desde $150',
        image_path: null,
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
      },
      'MXN',
    ),
    ['Promoción Envío gratis desde $150: Envío gratis'],
  );
});

test('formatWhatsAppOrderMessage includes coupon in totals section', () => {
  const message = formatWhatsAppOrderMessage({
    orderId: '11111111-2222-3333-4444-555555555555',
    restaurantName: 'Taquería',
    currency: 'MXN',
    lines: [] as PublicMenuCartLine[],
    quote: baseQuote,
    fulfillment: {
      serviceType: 'takeout',
      customerName: 'María',
      customerPhoneCountryIso: 'MX',
      customerPhoneLocal: '5512345678',
      paymentMethod: 'cash',
      deliveryAddress: '',
      deliveryAddressDetails: '',
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryFeeCents: null,
      cashDenominationCents: null,
    },
    productsById: new Map(),
    promotionsById: new Map(),
    itemCount: 0,
  });

  assert.match(message, /Cupón PIZZA20: -\$20\.00/);
  assert.match(message, /\*TOTAL: \$80\.00\*/);
});
