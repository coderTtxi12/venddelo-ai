import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrderItem, Product } from '@/lib/api/types';
import { resolveOrderItemOptions } from './orderDisplay.ts';

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
      },
    ],
  );
});
