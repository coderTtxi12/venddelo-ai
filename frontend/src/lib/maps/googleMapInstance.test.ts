import assert from 'node:assert/strict';
import test from 'node:test';

import { mapNeedsNewInstance } from './googleMapInstance.ts';

test('needs a new instance when the map or container is missing', () => {
  const container = { id: 'live' } as HTMLElement;
  assert.equal(mapNeedsNewInstance(null, container), true);
  assert.equal(mapNeedsNewInstance({ getDiv: () => container }, null), true);
});

test('reuses the map only when it is still bound to the live container', () => {
  const live = { id: 'live' } as HTMLElement;
  const detached = { id: 'detached' } as HTMLElement;

  assert.equal(mapNeedsNewInstance({ getDiv: () => live }, live), false);
  assert.equal(mapNeedsNewInstance({ getDiv: () => detached }, live), true);
});
