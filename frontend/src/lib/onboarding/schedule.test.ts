import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOnboardingSchedulePayload,
  createDefaultOnboardingSchedule,
  normalizeOnboardingScheduleDrafts,
} from './schedule.ts';

test('keeps every weekday closed without injecting default hours', () => {
  const closed = createDefaultOnboardingSchedule().map((block) => ({
    ...block,
    days: block.days.map((day) => ({ ...day, isClosed: true, slots: [] })),
  }));

  const normalized = normalizeOnboardingScheduleDrafts(closed);
  const days = normalized[0]?.days ?? [];

  assert.equal(days.length, 7);
  assert.ok(days.every((day) => day.isClosed && day.slots.length === 0));
});

test('all-closed onboarding does not emit schedule rows', () => {
  const closed = createDefaultOnboardingSchedule().map((block) => ({
    ...block,
    days: block.days.map((day) => ({ ...day, isClosed: true, slots: [] })),
  }));

  const payload = buildOnboardingSchedulePayload(closed, {
    takeoutEnabled: true,
    deliveryEnabled: true,
  });

  assert.deepEqual(payload, []);
});
