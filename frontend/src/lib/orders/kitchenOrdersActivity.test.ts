import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldOpenKitchenOrdersSocket } from './kitchenOrdersActivity.ts';

test('kitchen socket opens only when the dashboard tab is visible', () => {
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: 'r1',
      accessToken: 'tok',
      visibilityState: 'visible',
    }),
    true,
  );
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: 'r1',
      accessToken: 'tok',
      visibilityState: 'hidden',
    }),
    false,
  );
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: null,
      accessToken: 'tok',
      visibilityState: 'visible',
    }),
    false,
  );
  assert.equal(
    shouldOpenKitchenOrdersSocket({
      restaurantId: 'r1',
      accessToken: null,
      visibilityState: 'visible',
    }),
    false,
  );
});
