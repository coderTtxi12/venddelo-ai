import assert from 'node:assert/strict';
import test from 'node:test';

import type { Order, OrderItem, Product } from '@/lib/api/types';
import {
  buildOrderTotalsBreakdown,
  formatOrderDisplayId,
  resolveOrderItemBaseUnitCents,
  resolveOrderItemOptions,
} from './orderDisplay.ts';

const GROUP_ID = '11111111-1111-1111-1111-111111111111';
const OPTION_ID = '22222222-2222-2222-2222-222222222222';
const INACTIVE_OPTION_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT_ID = 'product-1';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    restaurant_id: 'restaurant-1',
    name: 'Burger',
    description: null,
    price_cents: 7600,
    currency: 'MXN',
    image_path: null,
    status: 'active',
    category_ids: [],
    option_groups: [
      {
        id: GROUP_ID,
        product_id: PRODUCT_ID,
        title: 'Elige tu salsa',
        selection: 'single',
        required: true,
        min_selections: 1,
        max_selections: 1,
        sort_index: 0,
        is_active: true,
        items: [
          {
            id: OPTION_ID,
            label: 'BBQ',
            price_delta_cents: 0,
            sort_index: 0,
            is_active: true,
          },
          {
            id: INACTIVE_OPTION_ID,
            label: 'Chipotle',
            price_delta_cents: 0,
            sort_index: 1,
            is_active: false,
          },
        ],
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function buildItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    product_id: PRODUCT_ID,
    product_name: 'Burger',
    product_image_path: null,
    quantity: 1,
    unit_price_cents: 7600,
    selected_options: { [GROUP_ID]: [OPTION_ID] },
    line_subtotal_cents: 7600,
    discount_cents: 0,
    line_total_cents: 7600,
    applied_promotion_id: null,
    applied_discounts: [],
    ...overrides,
  };
}

test('resolveOrderItemOptions returns nothing while the product catalog is still loading', () => {
  assert.deepEqual(resolveOrderItemOptions(buildItem(), new Map()), []);
});

test('resolveOrderItemOptions does not expose raw option ids when the product is missing', () => {
  assert.deepEqual(
    resolveOrderItemOptions(
      buildItem({
        selected_options: {
          [GROUP_ID]: ['18f4ce0a-aa96-42ad-9d5d-01aa747e9416'],
        },
      }),
      new Map(),
    ),
    [],
  );
});

test('resolveOrderItemOptions resolves labels from the product catalog', () => {
  const product = buildProduct();
  assert.deepEqual(resolveOrderItemOptions(buildItem(), new Map([[product.id, product]])), [
    {
      groupId: GROUP_ID,
      groupTitle: 'Elige tu salsa',
      labels: ['BBQ'],
      choices: [{ id: OPTION_ID, label: 'BBQ', priceDeltaCents: 0 }],
    },
  ]);
});

test('resolveOrderItemOptions includes inactive option items for historical orders', () => {
  const product = buildProduct();
  assert.deepEqual(
    resolveOrderItemOptions(
      buildItem({ selected_options: { [GROUP_ID]: [INACTIVE_OPTION_ID] } }),
      new Map([[product.id, product]]),
    ),
    [
      {
        groupId: GROUP_ID,
        groupTitle: 'Elige tu salsa',
        labels: ['Chipotle'],
        choices: [{ id: INACTIVE_OPTION_ID, label: 'Chipotle', priceDeltaCents: 0 }],
      },
    ],
  );
});

test('resolveOrderItemOptions includes priced complement choices', () => {
  const pricedOptionId = '44444444-4444-4444-4444-444444444444';
  const product = buildProduct({
    option_groups: [
      {
        id: GROUP_ID,
        product_id: PRODUCT_ID,
        title: 'Extras',
        selection: 'multi',
        required: false,
        min_selections: 0,
        max_selections: 3,
        sort_index: 0,
        is_active: true,
        items: [
          {
            id: pricedOptionId,
            label: 'Queso extra',
            price_delta_cents: 1500,
            sort_index: 0,
            is_active: true,
          },
        ],
      },
    ],
  });
  const rows = resolveOrderItemOptions(
    buildItem({
      selected_options: { [GROUP_ID]: [pricedOptionId] },
      unit_price_cents: 9100,
    }),
    new Map([[product.id, product]]),
  );
  assert.equal(rows[0]?.choices[0]?.priceDeltaCents, 1500);
  assert.equal(
    resolveOrderItemBaseUnitCents(
      buildItem({ unit_price_cents: 9100, selected_options: { [GROUP_ID]: [pricedOptionId] } }),
      new Map([[product.id, product]]),
      rows,
    ),
    7600,
  );
});

test('formatOrderDisplayId uses a 5-character checkout ref', () => {
  assert.equal(
    formatOrderDisplayId({
      id: '11111111-2222-3333-4444-555555555555',
      note: 'Ref. pedido #K7M2P | sin cebolla',
    } as Order),
    'K7M2P',
  );
});

test('formatOrderDisplayId shortens legacy 8-character refs and uuid prefixes', () => {
  assert.equal(
    formatOrderDisplayId({
      id: '11111111-2222-3333-4444-555555555555',
      note: 'Ref. pedido #A1B2C3D4',
    } as Order),
    'A1B2C',
  );
  assert.equal(
    formatOrderDisplayId({
      id: 'abcdef12-3456-7890-abcd-ef1234567890',
      note: null,
    } as Order),
    'ABCDE',
  );
});

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    restaurant_id: 'rest-1',
    type: 'delivery',
    customer_name: 'Cliente',
    customer_phone: '+525512345678',
    payment_method: 'cash',
    subtotal_cents: 9000,
    subtotal_before_discount_cents: 11000,
    discount_cents: 0,
    total_cents: 12500,
    applied_order_promotion_id: null,
    applied_order_discounts: [
      {
        label: 'Cupón MXY20',
        badge: 'MXY20',
        discount_cents: 2000,
        applied: true,
      },
    ],
    applied_coupon_id: 'coupon-1',
    applied_coupon_code: 'MXY20',
    coupon_discount_cents: 2000,
    coupon_waived_delivery_cents: 0,
    status: 'pending',
    delivery_address: 'Calle 1',
    delivery_latitude: null,
    delivery_longitude: null,
    delivery_fee_cents: 3500,
    cash_denomination_cents: null,
    cancellation_reason: null,
    idempotency_key: null,
    note: null,
    kds_cleared_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    items: [],
    ...overrides,
  };
}

test('buildOrderTotalsBreakdown separates promo and coupon discounts', () => {
  const totals = buildOrderTotalsBreakdown(baseOrder());
  assert.equal(totals.promoOrderDiscountCents, 0);
  assert.equal(totals.couponDiscountCents, 2000);
  assert.equal(totals.restaurantSubtotalCents, 9000);
});

test('buildOrderTotalsBreakdown keeps promo order discount separate from coupon', () => {
  const totals = buildOrderTotalsBreakdown(
    baseOrder({
      discount_cents: 1500,
      subtotal_cents: 7500,
      total_cents: 11000,
      applied_order_discounts: [
        {
          label: '2x1 en bebidas',
          badge: null,
          discount_cents: 1500,
          applied: true,
        },
        {
          label: 'Cupón MXY20',
          badge: 'MXY20',
          discount_cents: 2000,
          applied: true,
        },
      ],
    }),
  );
  assert.equal(totals.promoOrderDiscountCents, 1500);
  assert.equal(totals.couponDiscountCents, 2000);
  assert.equal(totals.restaurantSubtotalCents, 7500);
});

test('buildOrderTotalsBreakdown customer delivery is zero when waived', () => {
  const totals = buildOrderTotalsBreakdown(
    baseOrder({
      delivery_fee_cents: 4500,
      coupon_waived_delivery_cents: 4500,
      total_cents: 9000,
    }),
  );
  assert.equal(totals.providerDeliveryFeeCents, 4500);
  assert.equal(totals.customerDeliveryFeeCents, 0);
  assert.equal(totals.deliveryFeeCents, 0);
  assert.equal(totals.couponWaivedDeliveryCents, 4500);
});
