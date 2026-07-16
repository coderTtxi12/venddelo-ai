import { searchDashboard } from '@/lib/search/dashboardSearch';
import type { Order, Product } from '@/lib/api/types';

const sampleProduct: Product = {
  id: 'prod-1',
  restaurant_id: 'rest-1',
  name: 'Tacos al Pastor',
  description: 'Con piña y cilantro',
  image_path: null,
  price_cents: 12000,
  currency: 'MXN',
  status: 'active',
  category_ids: ['cat-1'],
  option_groups: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const sampleOrder: Order = {
  id: '11111111-2222-3333-4444-555555555555',
  restaurant_id: 'rest-1',
  type: 'takeout',
  customer_name: 'María López',
  customer_phone: '+525512345678',
  payment_method: 'cash',
  subtotal_cents: 12000,
  subtotal_before_discount_cents: 12000,
  discount_cents: 0,
  total_cents: 12000,
  applied_order_promotion_id: null,
  applied_order_discounts: [],
  status: 'pending',
  delivery_address: null,
  delivery_latitude: null,
  delivery_longitude: null,
  delivery_fee_cents: 0,
  cash_denomination_cents: null,
  cancellation_reason: null,
  idempotency_key: null,
  note: null,
  created_at: '2026-07-16T12:00:00Z',
  updated_at: '2026-07-16T12:00:00Z',
  items: [
    {
      id: 'item-1',
      product_id: 'prod-1',
      product_name: 'Tacos al Pastor',
      product_image_path: null,
      quantity: 2,
      unit_price_cents: 6000,
      selected_options: null,
      line_subtotal_cents: 12000,
      discount_cents: 0,
      line_total_cents: 12000,
      applied_promotion_id: null,
      applied_discounts: [],
    },
  ],
};

describe('searchDashboard', () => {
  it('finds pages with fuzzy and partial queries', () => {
    const hits = searchDashboard({
      query: 'anlit',
      products: [],
      categories: [],
      orders: [],
    });

    expect(hits.some((hit) => hit.title === 'Analíticas')).toBe(true);
  });

  it('finds products and orders from live data', () => {
    const hits = searchDashboard({
      query: 'tacos',
      products: [sampleProduct],
      categories: [{ id: 'cat-1', restaurant_id: 'rest-1', name: 'Tacos', description: null, image_path: null, sort_index: 0, is_active: true, display_layout: 'vertical', created_at: '', updated_at: '' }],
      orders: [sampleOrder],
    });

    expect(hits.some((hit) => hit.kind === 'product')).toBe(true);
  });

  it('finds orders by customer name with partial text', () => {
    const hits = searchDashboard({
      query: 'maria',
      products: [],
      categories: [],
      orders: [sampleOrder],
    });

    expect(hits.some((hit) => hit.kind === 'order')).toBe(true);
  });

  it('returns empty results for blank query', () => {
    expect(
      searchDashboard({
        query: '   ',
        products: [sampleProduct],
        categories: [],
        orders: [sampleOrder],
      }),
    ).toEqual([]);
  });
});
