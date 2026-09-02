import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatKitchenCouponBanner,
  formatKitchenCouponChip,
  formatKitchenCouponDialogLine,
  joinKitchenWarningBanners,
  orderHasCouponStockWarning,
} from './kitchenCouponWarning.ts';

test('banner copy', () => {
  assert.equal(
    formatKitchenCouponBanner('PIZZA20'),
    'Cupón PIZZA20 sin existencias. Puedes confirmar igual.',
  );
  assert.equal(formatKitchenCouponDialogLine('PIZZA20'), '• Cupón PIZZA20 — sin existencias restantes');
});

test('warning only pending exhausted stock', () => {
  assert.equal(
    orderHasCouponStockWarning(
      { status: 'pending', applied_coupon_id: 'c1', applied_coupon_code: 'PIZZA20' },
      0,
      10,
    ),
    true,
  );
  assert.equal(
    orderHasCouponStockWarning(
      { status: 'pending', applied_coupon_id: 'c1', applied_coupon_code: 'PIZZA20' },
      2,
      10,
    ),
    false,
  );
  assert.equal(
    orderHasCouponStockWarning(
      { status: 'pending', applied_coupon_id: 'c1', applied_coupon_code: 'X' },
      null,
      null,
    ),
    false,
  );
});

test('formatKitchenCouponChip shows code only', () => {
  assert.equal(
    formatKitchenCouponChip({ applied_coupon_code: 'ENVIOGRATIS' }),
    'Cupón ENVIOGRATIS',
  );
  assert.equal(
    formatKitchenCouponChip({ applied_coupon_code: 'PIZZA20' }),
    'Cupón PIZZA20',
  );
  assert.equal(formatKitchenCouponChip({ applied_coupon_code: null }), null);
  assert.equal(formatKitchenCouponChip({ applied_coupon_code: '  ' }), null);
});

test('joinKitchenWarningBanners drops empty', () => {
  assert.equal(joinKitchenWarningBanners(['A', '', 'B']), 'A B');
});
