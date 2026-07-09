export type PageSlice<T> = {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
};

export function paginateItems<T>(items: T[], page: number, pageSize: number): PageSlice<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  const slice = items.slice(offset, offset + pageSize);
  const rangeStart = totalItems === 0 ? 0 : offset + 1;
  const rangeEnd = offset + slice.length;

  return {
    items: slice,
    page: safePage,
    totalPages,
    totalItems,
    rangeStart,
    rangeEnd,
  };
}
