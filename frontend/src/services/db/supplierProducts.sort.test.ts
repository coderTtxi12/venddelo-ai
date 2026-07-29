import { collectOptionItemSortUpdates } from '@/services/db/supplierProducts';

describe('collectOptionItemSortUpdates', () => {
  it('returns no updates when active item order is unchanged', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(collectOptionItemSortUpdates(items, items)).toEqual([]);
  });

  it('returns sort_index updates when active items are reordered', () => {
    const activeItems = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
    const existingActiveItems = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(collectOptionItemSortUpdates(activeItems, existingActiveItems)).toEqual([
      { itemId: 'b', sort_index: 0 },
      { itemId: 'a', sort_index: 1 },
    ]);
  });

  it('ignores items that were not active before', () => {
    const activeItems = [{ id: 'new' }, { id: 'a' }];
    const existingActiveItems = [{ id: 'a' }];
    expect(collectOptionItemSortUpdates(activeItems, existingActiveItems)).toEqual([
      { itemId: 'a', sort_index: 1 },
    ]);
  });
});
