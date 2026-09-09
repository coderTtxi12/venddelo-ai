import assert from 'node:assert/strict';
import test from 'node:test';

import { formatChangePct } from './historyPeriod';
import {
  formatIsoDayRange,
  hourBucketRange,
  statsChangeTone,
  statsRankPoints,
  statsSourceSegments,
  statsTrendPoints,
} from './statsView';

test('formatChangePct shows signed text so change is not color-only', () => {
  assert.equal(formatChangePct(12), '+12%');
  assert.equal(formatChangePct(-8.5), '-8.5%');
  assert.equal(formatChangePct(0), '0%');
  assert.equal(formatChangePct(null), '—');
});

test('statsChangeTone is flat at zero and signed otherwise', () => {
  assert.equal(statsChangeTone(12), 'up');
  assert.equal(statsChangeTone(-3), 'down');
  assert.equal(statsChangeTone(0), 'flat');
  assert.equal(statsChangeTone(null), 'flat');
});

test('statsTrendPoints maps series counts for the overlay chart', () => {
  assert.deepEqual(
    statsTrendPoints([
      { label: '09:00', current_count: 4, previous_count: 2 },
      { label: '10:00', current_count: 0, previous_count: 1 },
    ]),
    [
      { label: '09:00', current: 4, previous: 2 },
      { label: '10:00', current: 0, previous: 1 },
    ],
  );
});

test('statsSourceSegments labels App web vs Pedido manual with distinct colors', () => {
  const segments = statsSourceSegments([
    { source: 'web_app', count: 7 },
    { source: 'manual', count: 3 },
  ]);
  assert.equal(segments[0]?.label, 'App web');
  assert.equal(segments[1]?.label, 'Pedido manual');
  assert.notEqual(segments[0]?.color, segments[1]?.color);
  assert.equal(segments[0]?.value, 7);
});

test('statsRankPoints sorts already ranked rows into bar points', () => {
  assert.deepEqual(
    statsRankPoints([
      { id: 'r1', name: 'Tacos', delivered_count: 9, earnings_cents: 9000 },
    ]),
    [{ key: 'r1', label: 'Tacos', value: 9, earningsCents: 9000 }],
  );
});

test('formatIsoDayRange collapses a single day', () => {
  assert.equal(formatIsoDayRange('2026-09-09', '2026-09-09'), '2026-09-09');
  assert.equal(formatIsoDayRange('2026-08-01', '2026-08-31'), '2026-08-01 a 2026-08-31');
});

test('hour buckets floor to the started hour', () => {
  assert.equal(hourBucketRange(10), '10:00–10:59');
});
