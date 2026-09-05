import assert from 'node:assert/strict';
import test from 'node:test';

import type { Product } from '@/lib/api/types.ts';
import type { PublicMenuCartLine } from './types.ts';
import {
  cartAvailabilityIssueMessage,
  formatCartAvailabilityMessages,
  validateCartAvailability,
  validateCartStock,
} from './validateCartAvailability.ts';

function product(partial: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    restaurant_id: 'r1',
    price_cents: 1000,
    currency: 'MXN',
    status: 'active',
    description: null,
    image_path: null,
    category_ids: [],
    option_groups: [],
    created_at: '',
    updated_at: '',
    inventory_qty: null,
    show_low_stock: false,
    ...partial,
  };
}

function line(
  partial: Partial<PublicMenuCartLine> & Pick<PublicMenuCartLine, 'id' | 'productId' | 'productName'>,
): PublicMenuCartLine {
  return {
    quantity: 1,
    unitBaseCents: 1000,
    currency: 'MXN',
    selections: {},
    optionLabels: [],
    imagePath: null,
    ...partial,
  };
}

test('validateCartStock ignores products without tracked inventory_qty', () => {
  const products = new Map([['p1', product({ id: 'p1', name: 'Tacos', inventory_qty: null })]]);
  const issues = validateCartStock([line({ id: 'l1', productId: 'p1', productName: 'Tacos', quantity: 9 })], products);
  assert.equal(issues.length, 0);
});

test('validateCartStock flags shortfall with available count', () => {
  const products = new Map([['p1', product({ id: 'p1', name: 'Tacos', inventory_qty: 2 })]]);
  const issues = validateCartStock(
    [
      line({ id: 'l1', productId: 'p1', productName: 'Tacos', quantity: 2 }),
      line({ id: 'l2', productId: 'p1', productName: 'Tacos', quantity: 1 }),
    ],
    products,
  );
  assert.equal(issues.length, 2);
  assert.equal(issues[0]?.kind, 'stock');
  if (issues[0]?.kind === 'stock') {
    assert.equal(issues[0].available, 2);
    assert.equal(issues[0].requested, 3);
  }
});

test('validateCartAvailability includes stock after product checks', () => {
  const products = new Map([['p1', product({ id: 'p1', name: 'Agua', inventory_qty: 1 })]]);
  const issues = validateCartAvailability(
    [line({ id: 'l1', productId: 'p1', productName: 'Agua', quantity: 3 })],
    products,
    new Set(['p1']),
  );
  assert.equal(issues.some((issue) => issue.kind === 'stock'), true);
  assert.deepEqual(formatCartAvailabilityMessages(issues, 'summary'), [
    'Solo quedan 1 de «Agua»',
  ]);
  assert.equal(
    cartAvailabilityIssueMessage(issues[0]!, 'line'),
    'Solo quedan 1 · Baja la cantidad',
  );
});

test('validateCartStock allows exact available quantity', () => {
  const products = new Map([['p1', product({ id: 'p1', name: 'Tacos', inventory_qty: 2 })]]);
  const issues = validateCartStock(
    [line({ id: 'l1', productId: 'p1', productName: 'Tacos', quantity: 2 })],
    products,
  );
  assert.equal(issues.length, 0);
});
