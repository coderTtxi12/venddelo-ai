'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  getCategoryScrollAnchorPosition,
  resolveActiveCategoryId,
} from './categoryScrollSpy';

type UseCategoryScrollSpyOptions = {
  enabled: boolean;
  categoryIds: readonly string[];
  sectionRefs: RefObject<Record<string, HTMLElement | null>>;
  scrollRootRef: RefObject<HTMLElement | null>;
  categoryBarRef?: RefObject<HTMLElement | null>;
  heroCollapsed: boolean;
  pinnedBarHeight: number;
  /** When set, used instead of measuring the category bar (e.g. desktop main column). */
  anchorBarHeight?: number;
  activeCategoryId: string | null;
  onActiveCategoryChange: (categoryId: string) => void;
};

export function useCategoryScrollSpy({
  enabled,
  categoryIds,
  sectionRefs,
  scrollRootRef,
  categoryBarRef,
  heroCollapsed,
  pinnedBarHeight,
  anchorBarHeight,
  activeCategoryId,
  onActiveCategoryChange,
}: UseCategoryScrollSpyOptions) {
  const rafRef = useRef<number | null>(null);
  const scrollLockUntilRef = useRef(0);
  const activeCategoryRef = useRef<string | null>(activeCategoryId);

  useEffect(() => {
    activeCategoryRef.current = activeCategoryId;
  }, [activeCategoryId]);

  const lockScrollSpy = useCallback((durationMs = 750) => {
    scrollLockUntilRef.current = Date.now() + durationMs;
  }, []);

  const syncActiveCategory = useCallback(() => {
    if (!enabled || Date.now() < scrollLockUntilRef.current) return;

    const root = scrollRootRef.current;
    if (!root) return;

    const nearBottom =
      root.scrollHeight - root.clientHeight - root.scrollTop <= 48;
    if (nearBottom && categoryIds.length > 0) {
      const lastId = categoryIds[categoryIds.length - 1];
      if (lastId !== activeCategoryRef.current) {
        activeCategoryRef.current = lastId;
        onActiveCategoryChange(lastId);
      }
      return;
    }

    const categoryBarHeight =
      anchorBarHeight ?? categoryBarRef?.current?.offsetHeight ?? 52;

    const scrollAnchor = getCategoryScrollAnchorPosition(root, {
      categoryBar: categoryBarRef?.current,
      heroCollapsed,
      pinnedBarHeight,
      categoryBarHeight,
    });

    const nextId = resolveActiveCategoryId(
      categoryIds,
      (id) => sectionRefs.current?.[id] ?? null,
      root,
      scrollAnchor,
    );

    if (nextId && nextId !== activeCategoryRef.current) {
      activeCategoryRef.current = nextId;
      onActiveCategoryChange(nextId);
    }
  }, [
    enabled,
    categoryIds,
    sectionRefs,
    scrollRootRef,
    categoryBarRef,
    heroCollapsed,
    pinnedBarHeight,
    anchorBarHeight,
    onActiveCategoryChange,
  ]);

  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncActiveCategory();
    });
  }, [syncActiveCategory]);

  useEffect(() => {
    if (!enabled) return;
    const root = scrollRootRef.current;
    if (!root) return;

    root.addEventListener('scroll', handleScroll, { passive: true });
    syncActiveCategory();

    return () => {
      root.removeEventListener('scroll', handleScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, handleScroll, syncActiveCategory, scrollRootRef]);

  useEffect(() => {
    if (enabled) syncActiveCategory();
  }, [enabled, heroCollapsed, categoryIds, syncActiveCategory]);

  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(() => syncActiveCategory());
    return () => cancelAnimationFrame(frame);
  }, [enabled, categoryIds, syncActiveCategory]);

  return { lockScrollSpy, syncActiveCategory };
}
