import assert from 'node:assert/strict';
import test from 'node:test';

import { canManageRiderApp } from '../access/deliveryProviderPermissions';
import {
  pickDroppedApkFile,
  riderApkDropActiveHint,
  riderApkDropIdleHint,
  riderApkDropRejectHint,
  riderApkEmptyHint,
  riderApkReadOnlyHint,
} from './riderApkCopy';

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

test('dropzone copy explains drag, drop and apk-only', () => {
  assert.match(riderApkDropIdleHint(), /arrastra/i);
  assert.match(riderApkDropActiveHint(), /suelta/i);
  assert.match(riderApkDropRejectHint(), /\.apk/i);
});

test('pickDroppedApkFile takes the first apk and ignores other files', () => {
  const apk = pickDroppedApkFile([
    { name: 'notes.txt', type: 'text/plain' },
    { name: 'mexy-rider.apk', type: 'application/vnd.android.package-archive' },
    { name: 'other.apk', type: '' },
  ]);
  assert.equal(apk?.name, 'mexy-rider.apk');
});

test('pickDroppedApkFile rejects non-apk drops', () => {
  assert.equal(pickDroppedApkFile([{ name: 'mexy-rider.zip', type: 'application/zip' }]), null);
  assert.equal(pickDroppedApkFile([]), null);
});
