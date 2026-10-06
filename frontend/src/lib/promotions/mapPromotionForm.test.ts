import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyPromotionDraft } from './promotionDraft.ts';
import { mapPromotionFormToApi, resolvePromotionType } from './mapPromotionForm.ts';

test('keeps product_discount as percent when multiple products are selected', () => {
  const base = createEmptyPromotionDraft();
  const payload = {
    ...base,
    kind: 'percent' as const,
    scope: 'product' as const,
    productIds: ['p1', 'p2', 'p3'],
    percent: 15,
  };

  assert.equal(resolvePromotionType(payload, 'product_discount'), 'percent');
  assert.equal(mapPromotionFormToApi(payload, 'product_discount').type, 'percent');
});

test('maps combo template to combo type', () => {
  const base = createEmptyPromotionDraft();
  const payload = {
    ...base,
    kind: 'percent' as const,
    scope: 'product' as const,
    productIds: ['p1', 'p2'],
    percent: 10,
  };

  assert.equal(resolvePromotionType(payload, 'combo'), 'combo');
  assert.equal(mapPromotionFormToApi(payload, 'combo').type, 'combo');
});

test('maps combo price kind to combo_price_cents', () => {
  const base = createEmptyPromotionDraft();
  const payload = {
    ...base,
    kind: 'combo_price' as const,
    scope: 'product' as const,
    productIds: ['p1', 'p2'],
    amount: 149,
  };

  const api = mapPromotionFormToApi(payload, 'combo');
  assert.equal(api.type, 'combo');
  assert.equal(api.combo_price_cents, 14900);
  assert.equal(api.amount_cents, null);
  assert.equal(api.percent, null);
});

test('maps a named 2x combo price to combo_pick_quantity', () => {
  const base = createEmptyPromotionDraft();
  const payload = {
    ...base,
    name: '2 Hamburguesas x 100',
    kind: 'combo_price' as const,
    scope: 'product' as const,
    productIds: ['p1', 'p2', 'p3', 'p4'],
    amount: 100,
  };

  const api = mapPromotionFormToApi(payload, 'combo');
  assert.equal(api.combo_pick_quantity, 2);
  assert.equal(api.combo_price_cents, 10000);
});
