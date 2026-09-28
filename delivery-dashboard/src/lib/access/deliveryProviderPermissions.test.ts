import assert from 'node:assert/strict';
import test from 'node:test';

import { canRemoveTeamMember } from './deliveryProviderPermissions';

test('only admins and operators can be removed from the delivery team', () => {
  assert.equal(canRemoveTeamMember('admin'), true);
  assert.equal(canRemoveTeamMember('operator'), true);
  assert.equal(canRemoveTeamMember('owner'), false);
  assert.equal(canRemoveTeamMember('dispatcher'), false);
  assert.equal(canRemoveTeamMember('driver'), false);
  assert.equal(canRemoveTeamMember(null), false);
});
