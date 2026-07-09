import { paginateItems } from '@/lib/paginate';

describe('paginateItems', () => {
  it('slices items for the requested page', () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1);
    const page = paginateItems(items, 2, 10);

    expect(page.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(3);
    expect(page.rangeStart).toBe(11);
    expect(page.rangeEnd).toBe(20);
  });

  it('clamps page when out of bounds', () => {
    const page = paginateItems([1, 2, 3], 9, 2);
    expect(page.page).toBe(2);
    expect(page.items).toEqual([3]);
  });
});
