import assert from 'node:assert/strict';
import test from 'node:test';

import type { Product } from '@/lib/api/types';
import { filterPublicMenuProducts } from '@/lib/digital-menu/orderableProducts';
import {
  isProductMenuScheduleActive,
  productMenuScheduleToApi,
  productOutsideScheduleCopy,
  validateProductMenuScheduleDraft,
} from './productMenuSchedule';

function product(schedule: Product['menu_schedule']): Product {
  return {
    id: 'p1',
    restaurant_id: 'r1',
    name: 'Tacos',
    description: null,
    price_cents: 1000,
    currency: 'MXN',
    image_path: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    category_ids: [],
    option_groups: [],
    menu_schedule: schedule,
  };
}

test('productMenuScheduleToApi returns null when disabled', () => {
  assert.equal(
    productMenuScheduleToApi({
      enabled: false,
      useWeekdays: false,
      weekdays: [],
      useTimeWindow: false,
      dailyStartTime: '09:00',
      dailyEndTime: '22:00',
    }),
    null,
  );
});

test('validateProductMenuScheduleDraft requires a rule when enabled', () => {
  assert.equal(
    validateProductMenuScheduleDraft({
      enabled: true,
      useWeekdays: false,
      weekdays: [],
      useTimeWindow: false,
      dailyStartTime: '09:00',
      dailyEndTime: '22:00',
    }),
    'Activa días específicos o un horario del día, o desactiva el horario de pedido.',
  );
});

test('isProductMenuScheduleActive respects weekdays', () => {
  const tacos = product({
    weekdays: [6],
    use_time_window: false,
    daily_start_time: null,
    daily_end_time: null,
  });
  const sunday = new Date('2026-03-15T18:00:00Z');
  const monday = new Date('2026-03-16T18:00:00Z');
  assert.equal(isProductMenuScheduleActive(tacos, sunday, 'America/Mexico_City'), true);
  assert.equal(isProductMenuScheduleActive(tacos, monday, 'America/Mexico_City'), false);
  assert.equal(productOutsideScheduleCopy(tacos, sunday, 'America/Mexico_City'), null);
  const closed = productOutsideScheduleCopy(tacos, monday, 'America/Mexico_City');
  assert.equal(closed?.badge, 'Fuera de horario');
  assert.equal(closed?.when, 'Solo los domingos');
  assert.match(closed?.notice ?? '', /Se puede pedir solo los domingos/);
});

test('scheduled products stay on the public menu outside their window', () => {
  const breakfast = product({
    weekdays: [],
    use_time_window: true,
    daily_start_time: '07:00',
    daily_end_time: '11:00',
  });
  const afternoon = new Date('2026-03-16T20:00:00Z');
  assert.equal(isProductMenuScheduleActive(breakfast, afternoon, 'America/Mexico_City'), false);
  assert.deepEqual(
    filterPublicMenuProducts([breakfast]).map((item) => item.id),
    ['p1'],
  );
  assert.equal(
    productOutsideScheduleCopy(breakfast, afternoon, 'America/Mexico_City')?.when,
    'De 7:00 a.m. a 11:00 a.m.',
  );
});
