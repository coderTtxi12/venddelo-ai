import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPrepMinutes, prepMinutesFromTimes, requestPrepMinutes } from './prepTime';

test('prepMinutesFromTimes uses the restaurant ready_at minus created_at', () => {
  assert.equal(
    prepMinutesFromTimes('2026-08-27T12:00:00.000Z', '2026-08-27T12:15:00.000Z'),
    15,
  );
  assert.equal(prepMinutesFromTimes(null, '2026-08-27T12:15:00.000Z'), null);
});

test('formatPrepMinutes labels the minutes the restaurant chose', () => {
  assert.equal(formatPrepMinutes(1), '1 min');
  assert.equal(formatPrepMinutes(15), '15 min');
  assert.equal(formatPrepMinutes(null), null);
});

test('requestPrepMinutes prefers the stored value and falls back to timestamps', () => {
  assert.equal(requestPrepMinutes({ prep_minutes: 20 }), 20);
  assert.equal(
    requestPrepMinutes({
      created_at: '2026-08-27T12:00:00.000Z',
      ready_at: '2026-08-27T12:10:00.000Z',
    }),
    10,
  );
});
