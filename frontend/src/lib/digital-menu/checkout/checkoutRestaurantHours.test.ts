import assert from 'node:assert/strict';
import test from 'node:test';

import type { RestaurantSchedule } from '@/lib/api/types';

import {
  buildCheckoutClosedMessage,
  hasRestaurantTakeoutHours,
  isRestaurantOpenForCheckout,
  resolveCheckoutRestaurantOpenStatus,
} from './checkoutRestaurantHours.ts';

function scheduleForDay(dayOfWeek: number): RestaurantSchedule[] {
  return [
    {
      id: '1',
      service_type: 'takeout',
      day_of_week: dayOfWeek,
      opens_at: '10:00:00',
      closes_at: '22:00:00',
    },
  ];
}

const deliveryOnlySchedule: RestaurantSchedule[] = [
  {
    id: '2',
    service_type: 'delivery',
    day_of_week: 0,
    opens_at: '00:00:00',
    closes_at: '23:59:00',
  },
];

test('isRestaurantOpenForCheckout requires open when takeout hours exist', () => {
  const schedules = scheduleForDay(0);
  assert.equal(isRestaurantOpenForCheckout({ state: 'open', label: 'Abierto' }, schedules), true);
  assert.equal(isRestaurantOpenForCheckout({ state: 'closed', label: 'Cerrado' }, schedules), false);
  assert.equal(isRestaurantOpenForCheckout({ state: 'unknown', label: 'Sin horario' }, schedules), false);
});

test('isRestaurantOpenForCheckout allows send when no takeout hours configured', () => {
  assert.equal(isRestaurantOpenForCheckout({ state: 'unknown', label: 'Sin horario' }, []), true);
});

test('resolveCheckoutRestaurantOpenStatus ignores delivery hours', () => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;

  const closedTakeout = scheduleForDay(dayIndex).map((entry) => ({
    ...entry,
    opens_at: '18:00:00',
    closes_at: '22:00:00',
  }));

  const status = resolveCheckoutRestaurantOpenStatus(
    [...deliveryOnlySchedule, ...closedTakeout],
    now,
  );

  assert.equal(status.state, 'closed');
  assert.equal(hasRestaurantTakeoutHours([...deliveryOnlySchedule, ...closedTakeout]), true);
  assert.equal(isRestaurantOpenForCheckout(status, [...deliveryOnlySchedule, ...closedTakeout]), false);
});

test('buildCheckoutClosedMessage includes next opening detail', () => {
  const message = buildCheckoutClosedMessage({
    state: 'closed',
    label: 'Cerrado',
    detail: 'Abre hoy 6 p.m.',
  });
  assert.match(message, /cerrado/i);
  assert.match(message, /Abre hoy 6 p\.m\./);
});

test('resolveCheckoutRestaurantOpenStatus detects open takeout window', () => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const status = resolveCheckoutRestaurantOpenStatus(scheduleForDay(dayIndex), now);
  assert.equal(status.state, 'open');
});
