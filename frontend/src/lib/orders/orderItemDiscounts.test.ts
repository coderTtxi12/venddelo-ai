import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrderItem, Product, Promotion } from '@/lib/api/types';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from '@/lib/promotions/productCatalogDiscount';

import { resolveOrderItemDiscounts } from './orderItemDiscounts.ts';
import { orderItemPreDiscountCents } from './orderDisplay.ts';

const productId = 'prod-burger';
const bundlePromoId = 'promo-2x1';
const catalogPromoId = 'promo-catalog';

const product: Product = {
  id: productId,
  restaurant_id: 'rest-1',
  name: 'BURGER & BONELESS',
  description: null,
  price_cents: 25900,
  image_path: null,
  category_id: 'cat-1',
  is_available: true,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  option_groups: [],
};

const catalogPromo: Promotion = {
  id: catalogPromoId,
  restaurant_id: 'rest-1',
  name: `${PRODUCT_CATALOG_DISCOUNT_PREFIX}BURGER & BONELESS`,
  image_path: null,
  type: 'amount',
  scope: 'product',
  percent: null,
  amount_cents: 5900,
  min_order_cents: null,
  starts_at: null,
  ends_at: null,
  is_active: true,
  created_at: '',
  updated_at: '',
  product_ids: [productId],
  category_ids: [],
};

const bundlePromo: Promotion = {
  id: bundlePromoId,
  restaurant_id: 'rest-1',
  name: 'Hamburguesas 2×1',
  image_path: null,
  type: '2x1',
  scope: 'product',
  percent: null,
  amount_cents: null,
  min_order_cents: null,
  starts_at: null,
  ends_at: null,
  bundle: { get_quantity: 2, pay_quantity: 1 },
  is_active: true,
  created_at: '',
  updated_at: '',
  product_ids: [productId],
  category_ids: [],
};

function stackedOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    product_id: productId,
    product_name: product.name,
    product_image_path: null,
    quantity: 2,
    unit_price_cents: 20000,
    selected_options: null,
    line_subtotal_cents: 44000,
    discount_cents: 20000,
    line_total_cents: 24000,
    applied_promotion_id: bundlePromoId,
    applied_discounts: [
      {
        label: 'Descuento de producto',
        badge: null,
        discount_cents: 11800,
        applied: true,
      },
      {
        label: 'Hamburguesas 2×1',
        badge: '2×1',
        discount_cents: 8200,
        applied: true,
      },
    ],
    ...overrides,
  };
}

test('resolveOrderItemDiscounts splits stacked catalog + 2x1 using discount_cents for bundle', () => {
  const discounts = resolveOrderItemDiscounts(stackedOrderItem(), {
    product,
    promotions: [catalogPromo, bundlePromo],
  });

  assert.equal(discounts.length, 2);
  assert.equal(discounts[0]?.label, 'Descuento de producto');
  assert.equal(discounts[0]?.discount_cents, 11800);
  assert.equal(discounts[1]?.label, 'Hamburguesas 2×1');
  assert.equal(discounts[1]?.discount_cents, 20000);
  assert.equal(discounts[1]?.badge, '2×1');
});

test('orderItemPreDiscountCents is line total plus all resolved discounts', () => {
  const discounts = resolveOrderItemDiscounts(stackedOrderItem(), {
    product,
    promotions: [catalogPromo, bundlePromo],
  });

  assert.equal(orderItemPreDiscountCents(stackedOrderItem(), discounts), 55800);
});

test('resolveOrderItemDiscounts rebuilds even when stored snapshots are wrong', () => {
  const discounts = resolveOrderItemDiscounts(stackedOrderItem(), {
    product,
    promotions: [catalogPromo, bundlePromo],
  });

  const bundleLine = discounts.find((row) => row.label === 'Hamburguesas 2×1');
  assert.notEqual(bundleLine?.discount_cents, 8200);
  assert.equal(bundleLine?.discount_cents, 20000);
});
