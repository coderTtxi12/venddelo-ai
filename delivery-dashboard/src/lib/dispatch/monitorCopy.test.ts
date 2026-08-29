import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockerLabel,
  blockersSummary,
  requestStatusLabel,
  timelineEventTitle,
} from './monitorCopy';

test('blockerLabel names outdated_app in Spanish', () => {
  assert.equal(blockerLabel('outdated_app'), 'App vieja');
});

test('blockersSummary keeps the text label so color is not the only signal', () => {
  const summary = blockersSummary([
    { code: 'outdated_app', count: 3 },
    { code: 'offline', count: 1 },
  ]);
  assert.equal(summary, 'App vieja (3) · Offline (1)');
});

test('picked_up means the rider arrived at the restaurant', () => {
  assert.equal(requestStatusLabel('picked_up'), 'En el restaurante');
  assert.equal(
    timelineEventTitle({ at: null, kind: 'picked_up' }),
    'En el restaurante',
  );
});
