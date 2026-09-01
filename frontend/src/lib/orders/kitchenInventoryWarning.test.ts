import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatKitchenInventoryBanner,
  formatKitchenInventoryDialogBody,
  kitchenInventoryShortfalls,
} from './kitchenInventoryWarning.ts';

test('kitchenInventoryShortfalls skips untracked and missing products', () => {
  const products = new Map([
    ['a', { name: 'Tacos', inventory_qty: null }],
    ['b', { name: 'Agua', inventory_qty: 4 }],
  ]);
  assert.deepEqual(
    kitchenInventoryShortfalls(
      [
        { product_id: 'a', quantity: 3, product_name: 'Tacos' },
        { product_id: 'b', quantity: 2, product_name: 'Agua' },
        { product_id: null, quantity: 9, product_name: 'Extra' },
        { product_id: 'missing', quantity: 1, product_name: 'Perdido' },
      ],
      products,
    ),
    [],
  );
});

test('kitchenInventoryShortfalls aggregates by product and reports shortfalls', () => {
  const products = new Map([
    ['a', { name: 'Tacos al pastor', inventory_qty: 2 }],
    ['b', { name: 'Agua', inventory_qty: 1 }],
  ]);
  assert.deepEqual(
    kitchenInventoryShortfalls(
      [
        { product_id: 'a', quantity: 2, product_name: 'Tacos al pastor' },
        { product_id: 'a', quantity: 1, product_name: 'Tacos al pastor' },
        { product_id: 'b', quantity: 1, product_name: 'Agua' },
      ],
      products,
    ),
    [{ productName: 'Tacos al pastor', requested: 3, available: 2 }],
  );
});

test('kitchenInventoryShortfalls reports zero stock as a shortfall', () => {
  const products = new Map([['a', { name: 'Tacos', inventory_qty: 0 }]]);
  assert.deepEqual(
    kitchenInventoryShortfalls(
      [{ product_id: 'a', quantity: 1, product_name: 'Tacos' }],
      products,
    ),
    [{ productName: 'Tacos', requested: 1, available: 0 }],
  );
});

test('warning copy lists products without blocking confirm', () => {
  const shortfalls = [{ productName: 'Tacos', requested: 5, available: 2 }];
  assert.match(formatKitchenInventoryBanner(shortfalls), /Tacos/);
  assert.match(formatKitchenInventoryBanner(shortfalls), /confirmar igual/i);
  assert.match(formatKitchenInventoryDialogBody(shortfalls), /piden 5, hay 2/);
  assert.match(formatKitchenInventoryDialogBody(shortfalls), /quedará en 0/i);
});
