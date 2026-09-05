import assert from 'node:assert/strict';
import test from 'node:test';

import type { RestaurantSchedule } from '@/lib/api/types.ts';
import {
  RESTAURANT_CLOSING_COUNTDOWN_LABEL,
  resolveRestaurantClosingCountdown,
} from './restaurantClosingCountdown.ts';

const TZ = 'America/Mexico_City';

function takeoutSchedule(dayOfWeek: number, opensAt: string, closesAt: string): RestaurantSchedule {
  return {
    id: `s-${dayOfWeek}`,
    restaurant_id: 'r1',
    service_type: 'takeout',
    day_of_week: dayOfWeek,
    opens_at: opensAt,
    closes_at: closesAt,
  };
}

test('resolveRestaurantClosingCountdown returns Cierra en while open today', () => {
  // Fixed instant: Tuesday 2026-09-08 18:00 CDT (UTC-5) ≈ 23:00 UTC
  const now = new Date('2026-09-09T00:00:00.000Z');
  const { weekday } = (() => {
    // America/Mexico_City Tuesday = day_of_week 1 in our Mon=0 map... use promotion helper weekday
    // Sep 8 2026 is Tuesday → weekday 1 (Mon=0)
    return { weekday: 1 };
  })();

  const state = resolveRestaurantClosingCountdown(now, TZ, {
    schedules: [takeoutSchedule(weekday, '09:00:00', '22:00:00')],
    enabledServices: ['takeout'],
  });

  assert.ok(state);
  assert.equal(state!.label, RESTAURANT_CLOSING_COUNTDOWN_LABEL);
  assert.equal(state!.isExpired, false);
  assert.match(state!.display, /^\d{2}:\d{2}:\d{2}$/);
});

test('resolveRestaurantClosingCountdown returns null before opening hours', () => {
  // Sep 8 2026 ~07:00 CDT (before 09:00 open)
  const now = new Date('2026-09-08T12:00:00.000Z');
  const state = resolveRestaurantClosingCountdown(now, TZ, {
    schedules: [takeoutSchedule(1, '09:00:00', '22:00:00')],
    enabledServices: ['takeout'],
  });
  assert.equal(state, null);
});

test('resolveRestaurantClosingCountdown returns null when already closed', () => {
  const now = new Date('2026-09-09T05:00:00.000Z'); // late evening Mexico
  const state = resolveRestaurantClosingCountdown(now, TZ, {
    schedules: [takeoutSchedule(1, '09:00:00', '18:00:00')],
    enabledServices: ['takeout'],
  });
  assert.equal(state, null);
});

test('resolveRestaurantClosingCountdown returns null without context or schedules', () => {
  const now = new Date('2026-09-09T00:00:00.000Z');
  assert.equal(resolveRestaurantClosingCountdown(now, TZ, null), null);
  assert.equal(
    resolveRestaurantClosingCountdown(now, TZ, { schedules: [], enabledServices: ['takeout'] }),
    null,
  );
});
