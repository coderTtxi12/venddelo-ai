import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScheduleDrafts,
  scheduleDraftsToCreatePayload,
  shouldShowRestaurantHoursEditor,
  toggleDayClosed,
} from './restaurantScheduleHours.ts';

test('empty saved hours still produce an editable closed week', () => {
  const drafts = buildScheduleDrafts([], ['takeout']);
  const days = drafts[0]?.days ?? [];

  assert.equal(days.length, 7);
  assert.ok(days.every((day) => day.isClosed && day.slots.length === 0));
});

test('opening a closed day after all-closed onboarding yields a save payload', () => {
  const drafts = buildScheduleDrafts([], ['takeout']);
  const takeout = drafts[0];
  assert.ok(takeout);

  const days = takeout.days.map((day, index) =>
    index === 0 ? toggleDayClosed(day) : day,
  );
  const payload = scheduleDraftsToCreatePayload([{ ...takeout, days }]);

  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.service_type, 'takeout');
  assert.equal(payload[0]?.day_of_week, 0);
  assert.equal(payload[0]?.opens_at, '09:00:00');
  assert.equal(payload[0]?.closes_at, '18:00:00');
});

test('hours editor stays available when every day was saved as closed', () => {
  assert.equal(
    shouldShowRestaurantHoursEditor({
      takeoutEnabled: false,
      deliveryEnabled: true,
      scheduleCount: 0,
    }),
    true,
  );
});

test('hours editor stays available when takeout is on but there are no rows', () => {
  assert.equal(
    shouldShowRestaurantHoursEditor({
      takeoutEnabled: true,
      deliveryEnabled: false,
      scheduleCount: 0,
    }),
    true,
  );
});
