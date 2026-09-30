import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldOpenKitchenOrdersSocket } from './kitchenOrdersActivity.ts';

test('kitchen socket stays open with restaurant session even if tab is backgrounded', () => {
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: 'r1',
      accessToken: 'tok',
    }),
    true,
  );
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: null,
      accessToken: 'tok',
    }),
    false,
  );
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: 'r1',
      accessToken: null,
    }),
    false,
  );
});
