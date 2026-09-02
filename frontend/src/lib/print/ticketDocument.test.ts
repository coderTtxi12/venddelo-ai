import assert from 'node:assert/strict';
import test from 'node:test';

import type { Order } from '@/lib/api/types';
import { formatCents } from '@/lib/orders/orderDisplay.ts';
import { DEFAULT_TICKET_PRINT_SETTINGS } from './ticketSettings.ts';
import { buildKitchenTicketDocument, sampleKitchenTicketOrder } from './ticketDocument.ts';

function takeoutOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    restaurant_id: 'rest-1',
    type: 'takeout',
    customer_name: 'María López',
    customer_phone: '+525512345678',
    payment_method: 'cash',
    subtotal_cents: 18000,
    subtotal_before_discount_cents: 18000,
    discount_cents: 0,
    total_cents: 18000,
    applied_order_promotion_id: null,
    applied_order_discounts: [],
    applied_coupon_id: null,
    applied_coupon_code: null,
    coupon_discount_cents: 0,
    coupon_waived_delivery_cents: 0,
    status: 'pending',
    delivery_address: null,
    delivery_latitude: null,
    delivery_longitude: null,
    delivery_fee_cents: 0,
    cash_denomination_cents: 50000,
    cancellation_reason: null,
    idempotency_key: null,
    note: 'Sin cebolla',
    kds_cleared_at: null,
    created_at: '2026-08-20T18:00:00Z',
    updated_at: '2026-08-20T18:00:00Z',
    items: [
      {
        id: 'item-1',
        product_id: 'prod-1',
        product_name: 'Tacos al Pastor',
        product_image_path: null,
        quantity: 2,
        unit_price_cents: 9000,
        selected_options: null,
        line_subtotal_cents: 18000,
        discount_cents: 0,
        line_total_cents: 18000,
        applied_promotion_id: null,
        applied_discounts: [],
      },
    ],
    ...overrides,
  };
}

test('sampleKitchenTicketOrder is takeout with items for settings preview', () => {
  assert.equal(sampleKitchenTicketOrder.type, 'takeout');
  assert.ok(sampleKitchenTicketOrder.items.length >= 1);
});

test('buildKitchenTicketDocument uses restaurant name when brand is empty', () => {
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder(),
    settings: DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: 'Taquería El Sol',
    restaurantAddress: 'Centro, Tlaxcala',
    logoUrl: 'https://cdn.example/logo.png',
  });
  assert.equal(doc.brandName, 'Taquería El Sol');
  assert.equal(doc.logoUrl, 'https://cdn.example/logo.png');
  assert.ok(doc.lines.some((line) => line.kind === 'brand' && line.text === 'Taquería El Sol'));
  assert.ok(doc.lines.some((line) => line.kind === 'item' && line.name === 'Tacos al Pastor'));
  assert.ok(doc.lines.some((line) => line.kind === 'kv' && line.label === 'Cliente' && line.value === 'María López'));
});

test('buildKitchenTicketDocument prefers custom brand name and hides optional fields', () => {
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder(),
    settings: {
      ...DEFAULT_TICKET_PRINT_SETTINGS,
      brand_name: 'Marca propia',
      show_logo: false,
      show_customer: false,
      show_notes: false,
      header_extra: 'RFC XAXX010101000',
      footer_message: 'Vuelve pronto',
    },
    restaurantName: 'Taquería El Sol',
    restaurantAddress: 'Centro',
    logoUrl: 'https://cdn.example/logo.png',
  });
  assert.equal(doc.brandName, 'Marca propia');
  assert.equal(doc.logoUrl, null);
  assert.ok(doc.lines.some((line) => line.kind === 'muted' && line.text === 'RFC XAXX010101000'));
  assert.ok(doc.lines.some((line) => line.kind === 'center' && line.text === 'Vuelve pronto'));
  assert.equal(
    doc.lines.some((line) => line.kind === 'kv' && line.label === 'Cliente'),
    false,
  );
  assert.equal(
    doc.lines.some((line) => line.kind === 'kv' && line.label === 'Notas'),
    false,
  );
});

test('buildKitchenTicketDocument lists item prices before discounts', () => {
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder({
      subtotal_cents: 18000,
      subtotal_before_discount_cents: 36000,
      discount_cents: 18000,
      total_cents: 18000,
      items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          product_name: 'Burger & Boneless',
          product_image_path: null,
          quantity: 2,
          unit_price_cents: 18000,
          selected_options: null,
          line_subtotal_cents: 36000,
          discount_cents: 18000,
          line_total_cents: 18000,
          applied_promotion_id: null,
          applied_discounts: [{ label: '2x1', badge: null, discount_cents: 18000, applied: true }],
        },
      ],
    }),
    settings: DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: 'Wild Rooster',
    restaurantAddress: 'Coacalco',
    logoUrl: null,
  });
  const itemLine = doc.lines.find((line) => line.kind === 'item');
  assert.ok(itemLine);
  if (itemLine && itemLine.kind === 'item') {
    assert.equal(itemLine.name, 'Burger & Boneless');
    assert.equal(itemLine.qty, 2);
    assert.equal(itemLine.price, formatCents(36000));
    assert.notEqual(itemLine.price, formatCents(18000));
  }
});

test('buildKitchenTicketDocument includes delivery address for delivery orders', () => {
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder({
      type: 'delivery',
      delivery_address: 'Calle Reforma 100\nReferencias: puerta azul',
      delivery_fee_cents: 4500,
      total_cents: 22500,
    }),
    settings: DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: 'Taquería El Sol',
    restaurantAddress: 'Centro',
    logoUrl: null,
  });
  assert.ok(
    doc.lines.some(
      (line) => line.kind === 'kv' && line.label === 'Tipo' && line.value === 'Entrega a domicilio',
    ),
  );
  assert.ok(
    doc.lines.some(
      (line) => line.kind === 'kv' && line.label === 'Entrega' && line.value.includes('Calle Reforma 100'),
    ),
  );
});

test('buildKitchenTicketDocument includes complements when the product catalog is available', () => {
  const groupId = 'group-1';
  const optionId = 'opt-1';
  const productId = 'prod-frappe';
  const product = {
    id: productId,
    restaurant_id: 'rest-1',
    name: 'Frappe moca',
    description: null,
    price_cents: 8500,
    currency: 'MXN',
    image_path: null,
    status: 'active' as const,
    category_ids: [],
    option_groups: [
      {
        id: groupId,
        product_id: productId,
        title: 'Personaliza tu bebida',
        selection: 'multiple' as const,
        required: false,
        min_selections: 0,
        max_selections: 4,
        sort_index: 0,
        is_active: true,
        items: [
          {
            id: optionId,
            label: 'Deslactosada',
            price_delta_cents: 0,
            sort_index: 0,
            is_active: true,
          },
        ],
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder({
      items: [
        {
          id: 'item-1',
          product_id: productId,
          product_name: 'Frappe moca',
          product_image_path: null,
          quantity: 1,
          unit_price_cents: 8500,
          selected_options: { [groupId]: [optionId] },
          line_subtotal_cents: 8500,
          discount_cents: 0,
          line_total_cents: 8500,
          applied_promotion_id: null,
          applied_discounts: [],
        },
      ],
    }),
    settings: DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: 'Freych',
    productsById: new Map([[productId, product]]),
  });
  assert.ok(
    doc.lines.some(
      (line) =>
        line.kind === 'option' &&
        line.text.includes('Personaliza tu bebida') &&
        line.text.includes('Deslactosada'),
    ),
  );
});

test('buildKitchenTicketDocument shows coupon savings without duplicating order discount', () => {
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder({
      type: 'delivery',
      subtotal_cents: 9000,
      subtotal_before_discount_cents: 11000,
      discount_cents: 0,
      total_cents: 12500,
      delivery_fee_cents: 3500,
      applied_coupon_id: 'coupon-1',
      applied_coupon_code: 'MXY20',
      coupon_discount_cents: 2000,
      coupon_waived_delivery_cents: 0,
      applied_order_discounts: [
        {
          label: 'Cupón MXY20',
          badge: 'MXY20',
          discount_cents: 2000,
          applied: true,
        },
      ],
    }),
    settings: DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: 'Taquería El Sol',
  });

  assert.equal(
    doc.lines.some((line) => line.kind === 'total' && line.label === 'Descuento del pedido'),
    false,
  );
  assert.ok(
    doc.lines.some(
      (line) =>
        line.kind === 'total' && line.label === 'Cupón MXY20' && line.value === '-$20.00',
    ),
  );
});

test('buildKitchenTicketDocument shows free shipping coupon on ticket', () => {
  const doc = buildKitchenTicketDocument({
    order: takeoutOrder({
      type: 'delivery',
      subtotal_cents: 11000,
      subtotal_before_discount_cents: 11000,
      total_cents: 11000,
      delivery_fee_cents: 0,
      applied_coupon_id: 'coupon-2',
      applied_coupon_code: 'ENVIO0',
      coupon_discount_cents: 0,
      coupon_waived_delivery_cents: 3500,
      applied_order_discounts: [
        {
          label: 'Cupón ENVIO0',
          badge: 'ENVIO0',
          discount_cents: 3500,
          applied: true,
        },
      ],
    }),
    settings: DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: 'Taquería El Sol',
  });

  assert.ok(
    doc.lines.some(
      (line) =>
        line.kind === 'total' && line.label === 'Cupón ENVIO0' && line.value === 'Envío gratis',
    ),
  );
});
