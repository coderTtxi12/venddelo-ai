import assert from 'node:assert/strict';
import test from 'node:test';

import {
  couponBenefitLabel,
  couponScopeLabel,
  couponStatusLabel,
  couponStockLabel,
  couponTypeLabel,
} from './display.ts';

test('coupon labels', () => {
  assert.equal(couponTypeLabel('percent'), 'Porcentaje');
  assert.equal(couponTypeLabel('amount'), 'Monto fijo');
  assert.equal(couponTypeLabel('free_shipping'), 'Envío gratis');
  assert.equal(couponScopeLabel('all'), 'Todo el pedido');
  assert.equal(couponBenefitLabel({ type: 'percent', percent: 20, amount_cents: null }), '20%');
  assert.equal(couponStockLabel(12, 50), '12 / 50');
  assert.equal(couponStockLabel(0, null), 'Ilimitado');
  assert.equal(couponStatusLabel('sold_out'), 'Agotado');
  assert.equal(couponStatusLabel('expired'), 'Expirado');
  assert.equal(couponStatusLabel('inactive'), 'Pausada');
  assert.equal(couponStatusLabel('active'), 'Activo');
});
