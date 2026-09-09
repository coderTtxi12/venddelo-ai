import assert from 'node:assert/strict';
import test from 'node:test';

import { reduceSuggestMenu } from './suggestMenu.ts';

test('reopens after select when the user edits again', () => {
  let state = reduceSuggestMenu({ open: false }, { type: 'focus' });
  assert.equal(state.open, true);

  state = reduceSuggestMenu(state, { type: 'select' });
  assert.equal(state.open, false);

  state = reduceSuggestMenu(state, { type: 'user-edit' });
  assert.equal(state.open, true);
});

test('reopens after dismiss when the user types again without leaving the field', () => {
  let state = reduceSuggestMenu({ open: true }, { type: 'dismiss' });
  assert.equal(state.open, false);

  state = reduceSuggestMenu(state, { type: 'user-edit' });
  assert.equal(state.open, true);
});
