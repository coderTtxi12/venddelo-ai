'use client';

import { useEffect, useRef } from 'react';

export function useKitchenOrdersInfiniteScroll(
  enabled: boolean,
  hasMore: boolean,
  loadingMore: boolean,
  onLoadMore: () => void,
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !hasMore || loadingMore) return;

    const sentinel = sentinelRef.current;
    const root = sentinel?.parentElement;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: '120px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, loadingMore, onLoadMore]);

  return sentinelRef;
}
