import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparisonDateRange,
  historyDateRange,
  isSameLengthRange,
  statsGranularity,
} from './historyPeriod';

const wednesday = new Date(2026, 8, 9, 14, 30);

test('historyDateRange today is a single civil day', () => {
  assert.deepEqual(historyDateRange('today', wednesday), {
    start: '2026-09-09',
    end: '2026-09-09',
  });
});

test('historyDateRange yesterday is the previous civil day', () => {
  assert.deepEqual(historyDateRange('yesterday', wednesday), {
    start: '2026-09-08',
    end: '2026-09-08',
  });
});

test('historyDateRange day before yesterday is anteayer', () => {
  assert.deepEqual(historyDateRange('day_before', wednesday), {
    start: '2026-09-07',
    end: '2026-09-07',
  });
});

test('comparisonDateRange uses the previous calendar month for a full month', () => {
  assert.deepEqual(comparisonDateRange('2026-09-01', '2026-09-30'), {
    start: '2026-08-01',
    end: '2026-08-31',
  });
});

test('comparisonDateRange uses equal length immediately before for a week', () => {
  assert.deepEqual(comparisonDateRange('2026-09-07', '2026-09-13'), {
    start: '2026-08-31',
    end: '2026-09-06',
  });
});

test('statsGranularity is hourly for one day and weekly beyond a month', () => {
  assert.equal(statsGranularity('2026-09-09', '2026-09-09'), 'hourly');
  assert.equal(statsGranularity('2026-09-07', '2026-09-13'), 'daily');
  assert.equal(statsGranularity('2026-08-01', '2026-09-30'), 'weekly');
});

test('isSameLengthRange allows day vs day and week vs week', () => {
  assert.equal(
    isSameLengthRange(
      { start: '2026-09-09', end: '2026-09-09' },
      { start: '2026-08-18', end: '2026-08-18' },
    ),
    true,
  );
  assert.equal(
    isSameLengthRange(
      { start: '2026-09-07', end: '2026-09-13' },
      { start: '2026-08-24', end: '2026-08-30' },
    ),
    true,
  );
  assert.equal(
    isSameLengthRange(
      { start: '2026-09-09', end: '2026-09-09' },
      { start: '2026-09-01', end: '2026-09-07' },
    ),
    false,
  );
});
