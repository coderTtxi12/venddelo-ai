import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canManageMembers,
  canRemoveTeamMember,
  canRemoveThisMember,
  visibleTeamMembers,
} from './deliveryProviderPermissions';

test('only admins and operators can be removed from the delivery team', () => {
  assert.equal(canRemoveTeamMember('admin'), true);
  assert.equal(canRemoveTeamMember('operator'), true);
  assert.equal(canRemoveTeamMember('owner'), false);
  assert.equal(canRemoveTeamMember('dispatcher'), false);
  assert.equal(canRemoveTeamMember('driver'), false);
  assert.equal(canRemoveTeamMember(null), false);
});

test('owners and admins manage the team, operators do not', () => {
  assert.equal(canManageMembers('owner'), true);
  assert.equal(canManageMembers('admin'), true);
  assert.equal(canManageMembers('operator'), false);
  assert.equal(canManageMembers(null), false);
});

test('a member cannot remove themselves or the owner', () => {
  assert.equal(
    canRemoveThisMember('admin-1', { user_id: 'admin-2', member_role: 'admin' }),
    true,
  );
  assert.equal(
    canRemoveThisMember('admin-1', { user_id: 'op-1', member_role: 'operator' }),
    true,
  );
  assert.equal(
    canRemoveThisMember('admin-1', { user_id: 'admin-1', member_role: 'admin' }),
    false,
  );
  assert.equal(
    canRemoveThisMember('admin-1', { user_id: 'owner-1', member_role: 'owner' }),
    false,
  );
  assert.equal(canRemoveThisMember(null, { user_id: 'op-1', member_role: 'operator' }), false);
});

test('admins do not see the owner in the team list', () => {
  const members = [
    { id: '1', member_role: 'owner' },
    { id: '2', member_role: 'admin' },
    { id: '3', member_role: 'operator' },
  ];
  assert.deepEqual(
    visibleTeamMembers('admin', members).map((member) => member.member_role),
    ['admin', 'operator'],
  );
  assert.deepEqual(
    visibleTeamMembers('owner', members).map((member) => member.member_role),
    ['owner', 'admin', 'operator'],
  );
});
