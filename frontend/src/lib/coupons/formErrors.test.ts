import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@/lib/api/types';
import {
  formatCouponSaveError,
  isCouponCodeConflictError,
} from './formErrors.ts';

test('formatCouponSaveError maps duplicate coupon code conflict', () => {
  const error = new ApiError('conflict', 'Coupon code already exists', 409);
  assert.match(
    formatCouponSaveError(error, 'create'),
    /Ya existe un cupón con ese código/,
  );
  assert.equal(isCouponCodeConflictError(error), true);
});

test('formatCouponSaveError maps Spanish duplicate coupon code conflict', () => {
  const error = new ApiError('conflict', 'Ya existe un cupón con ese código', 409);
  assert.match(
    formatCouponSaveError(error, 'edit'),
    /Ya existe un cupón con ese código/,
  );
});
