import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_STATUS_LABELS,
  historyDateRange,
  historyFiltersActive,
} from './historyFilters';

test('historyDateRange today is single UTC day', () => {
  const now = new Date('2026-09-03T15:00:00Z');
  assert.deepEqual(historyDateRange('today', now), {
    from: '2026-09-03',
    to: '2026-09-03',
  });
});

test('historyDateRange 7d inclusive window', () => {
  const now = new Date('2026-09-03T15:00:00Z');
  assert.deepEqual(historyDateRange('7d', now), {
    from: '2026-08-28',
    to: '2026-09-03',
  });
});

test('historyFiltersActive detects non-default filters', () => {
  assert.equal(
    historyFiltersActive({
      query: '',
      status: 'all',
      type: 'all',
      payment: 'all',
      recency: 'all',
    }),
    false,
  );
  assert.equal(
    historyFiltersActive({
      query: 'ana',
      status: 'all',
      type: 'all',
      payment: 'all',
      recency: 'all',
    }),
    true,
  );
  assert.ok(HISTORY_STATUS_LABELS.delivered);
});
