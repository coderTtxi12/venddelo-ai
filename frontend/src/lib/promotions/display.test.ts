import assert from 'node:assert/strict';
import test from 'node:test';

import type { Promotion } from '@/lib/api/types';
import { promotionStatusLabel } from './display.ts';

function base(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: '1',
    restaurant_id: 'r',
    name: 'Promo',
    image_path: null,
    show_banner: true,
    type: 'percent',
    scope: 'order',
    percent: 10,
    amount_cents: null,
    combo_price_cents: null,
    min_order_cents: null,
    starts_at: null,
    ends_at: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    product_ids: [],
    category_ids: [],
    option_item_ids: [],
    effective_status: 'active',
    ...overrides,
  };
}

test('promotionStatusLabel paused', () => {
  assert.equal(
    promotionStatusLabel(base({ is_active: false, effective_status: 'inactive' })),
    'Pausada',
  );
});

test('promotionStatusLabel active', () => {
  assert.equal(promotionStatusLabel(base({ effective_status: 'active' })), 'Vigente ahora');
});
