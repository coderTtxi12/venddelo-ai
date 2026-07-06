import assert from 'node:assert/strict';
import test from 'node:test';

import type { OptionGroup } from '@/lib/api/types';
import { activeOptionGroups, displayOptionGroups } from './optionGroupHint.ts';

function makeItem(
  id: string,
  label: string,
  isActive: boolean,
  sortIndex: number,
): OptionGroup['items'][number] {
  return {
    id,
    label,
    price_delta_cents: 0,
    sort_index: sortIndex,
    is_active: isActive,
  };
}

function makeGroup(
  id: string,
  items: OptionGroup['items'],
  isActive = true,
): OptionGroup {
  return {
    id,
    title: id,
    required: false,
    selection: 'multi',
    min_selections: 0,
    max_selections: null,
    sort_index: 0,
    is_active: isActive,
    items,
  };
}

test('displayOptionGroups includes inactive items after active ones', () => {
  const product = {
    option_groups: [
      makeGroup('g1', [
        makeItem('a', 'Activo', true, 0),
        makeItem('b', 'Agotado', false, 1),
      ]),
    ],
  };

  const display = displayOptionGroups(product);
  assert.equal(display.length, 1);
  assert.deepEqual(
    display[0].items.map((item) => item.id),
    ['a', 'b'],
  );
});

test('displayOptionGroups shows groups that only have sold-out items', () => {
  const product = {
    option_groups: [makeGroup('g1', [makeItem('b', 'Agotado', false, 0)])],
  };

  assert.equal(displayOptionGroups(product).length, 1);
  assert.equal(activeOptionGroups(product).length, 0);
});

test('displayOptionGroups hides inactive groups', () => {
  const product = {
    option_groups: [makeGroup('g1', [makeItem('a', 'Activo', true, 0)], false)],
  };

  assert.equal(displayOptionGroups(product).length, 0);
});
