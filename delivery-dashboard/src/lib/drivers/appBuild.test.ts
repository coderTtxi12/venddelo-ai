import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isCurrentRiderApp,
  riderAppTagLabel,
  riderAppTagTitle,
} from './appBuild';

test('isCurrentRiderApp rejects missing and stale builds', () => {
  assert.equal(isCurrentRiderApp(null), false);
  assert.equal(isCurrentRiderApp(undefined), false);
  assert.equal(isCurrentRiderApp(1), false);
  assert.equal(isCurrentRiderApp(2), true);
  assert.equal(isCurrentRiderApp(3), true);
});

test('riderAppTagLabel uses words, not color, for old APKs', () => {
  assert.equal(riderAppTagLabel(null, null), 'App antigua');
  assert.equal(riderAppTagLabel('1.0.0', 1), 'App 1.0.0');
  assert.equal(riderAppTagLabel('1.0.1', 2), 'App 1.0.1');
});

test('riderAppTagTitle explains why the rider is skipped', () => {
  assert.match(riderAppTagTitle(null, null), /APK anterior/);
  assert.match(riderAppTagTitle('1.0.0', 1), /no recibe pedidos nuevos/);
  assert.equal(riderAppTagTitle('1.0.1', 2), 'Build 2');
});
