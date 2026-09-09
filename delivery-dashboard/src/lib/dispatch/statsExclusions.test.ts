import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeStatsPhone, parseStoredExclusions } from './statsExclusions';

test('normalizeStatsPhone keeps digits for exclude chips', () => {
  assert.equal(normalizeStatsPhone('+52 55 1111-2222'), '525511112222');
  assert.equal(normalizeStatsPhone('abc'), '');
});

test('parseStoredExclusions reads restaurant, driver, and phone lists', () => {
  const parsed = parseStoredExclusions(
    JSON.stringify({
      restaurantIds: ['r1'],
      driverIds: ['d1'],
      phones: ['525511112222', 'bad'],
    }),
  );
  assert.deepEqual(parsed.restaurantIds, ['r1']);
  assert.deepEqual(parsed.driverIds, ['d1']);
  assert.deepEqual(parsed.phones, ['525511112222']);
});
