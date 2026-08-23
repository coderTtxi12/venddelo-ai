import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidRestaurantCollect,
  restaurantCollectFromCustomerTotal,
} from './collectTotal.ts';

test('subtracts delivery from the customer total', () => {
  assert.equal(restaurantCollectFromCustomerTotal(22500, 4500), 18000);
});

test('rejects a restaurant collect of zero or less', () => {
  assert.equal(isValidRestaurantCollect(restaurantCollectFromCustomerTotal(4500, 4500)), false);
  assert.equal(isValidRestaurantCollect(0), false);
  assert.equal(isValidRestaurantCollect(1), true);
});
