import assert from 'node:assert/strict';
import test from 'node:test';

import { formatChangePct } from './historyPeriod';
import {
  formatDuration,
  formatIsoDayRange,
  hourBucketRange,
  statsChangeTone,
  statsDurationPoints,
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

test('formatDuration uses seconds, minutes, and hours', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(480), '8 min');
  assert.equal(formatDuration(4320), '1 h 12 min');
});

test('statsDurationPoints converts seconds to minutes for the chart', () => {
  assert.deepEqual(
    statsDurationPoints([
      {
        label: '09:00',
        avg_total_seconds: 600,
        avg_search_seconds: 120,
        avg_delivery_seconds: 480,
        avg_pickup_seconds: 180,
        avg_dropoff_seconds: 240,
      },
    ]),
    [
      {
        label: '09:00',
        total: 10,
        search: 2,
        delivery: 8,
        pickup: 3,
        dropoff: 4,
      },
    ],
  );
});
