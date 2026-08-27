import assert from 'node:assert/strict';
import test from 'node:test';

import { canManageRiderApp } from '../access/deliveryProviderPermissions';
import { riderApkEmptyHint, riderApkReadOnlyHint } from './riderApkCopy';

test('only the delivery owner can upload or edit the rider APK', () => {
  assert.equal(canManageRiderApp('owner'), true);
  assert.equal(canManageRiderApp('admin'), false);
  assert.equal(canManageRiderApp('operator'), false);
  assert.equal(canManageRiderApp(null), false);
});

test('copy tells operators they can read but not edit', () => {
  assert.match(riderApkReadOnlyHint(), /solo lectura/i);
  assert.match(riderApkEmptyHint(), /aún no hay/i);
});
