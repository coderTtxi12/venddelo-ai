import type { CursorPage } from './types';

type FetchPage<T> = (cursor: string | null) => Promise<CursorPage<T>>;

/** Recorre todas las páginas de un endpoint con cursor. */
export async function fetchAllPages<T>(fetchPage: FetchPage<T>, pageSize = 100): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
    hasMore = page.has_more;
    if (page.items.length === 0) break;
    if (page.items.length < pageSize && !hasMore) break;
  }

  return items;
}
