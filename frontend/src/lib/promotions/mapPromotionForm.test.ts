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
