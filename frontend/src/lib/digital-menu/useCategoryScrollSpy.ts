'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  DOCUMENT_SCROLL_ROOT,
  getCategoryScrollAnchorPosition,
  resolveActiveCategoryId,
  type MenuScrollRoot,
} from './categoryScrollSpy';

type UseCategoryScrollSpyOptions = {
  enabled: boolean;
  categoryIds: readonly string[];
  sectionRefs: RefObject<Record<string, HTMLElement | null>>;
  scrollRootRef: RefObject<HTMLElement | null>;
  /** When true, ignore the element and use window/document scroll. */
  useDocumentScroll?: boolean;
  categoryBarRef?: RefObject<HTMLElement | null>;
  heroCollapsed: boolean;
  pinnedBarHeight: number;
  /** When set, used instead of measuring the category bar (e.g. desktop main column). */
  anchorBarHeight?: number;
  activeCategoryId: string | null;
  onActiveCategoryChange: (categoryId: string) => void;
};

function resolveMenuScrollRoot(
  useDocumentScroll: boolean,
  scrollRootRef: RefObject<HTMLElement | null>,
): MenuScrollRoot | null {
  if (useDocumentScroll) return DOCUMENT_SCROLL_ROOT;
  return scrollRootRef.current;
}

export function useCategoryScrollSpy({
  enabled,
  categoryIds,
  sectionRefs,
  scrollRootRef,
  useDocumentScroll = false,
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

    const root = resolveMenuScrollRoot(useDocumentScroll, scrollRootRef);
    if (!root) return;

    const nearBottom =
      root === DOCUMENT_SCROLL_ROOT
        ? document.documentElement.scrollHeight - window.innerHeight - window.scrollY <= 48
        : root.scrollHeight - root.clientHeight - root.scrollTop <= 48;

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
    useDocumentScroll,
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

    let attachedElement: HTMLElement | null = null;
    let attachedWindow = false;
    let waitFrame: number | null = null;

    const attachElement = (root: HTMLElement) => {
      attachedElement = root;
      root.addEventListener('scroll', handleScroll, { passive: true });
      syncActiveCategory();
    };

    const attachWindow = () => {
      attachedWindow = true;
      window.addEventListener('scroll', handleScroll, { passive: true });
      syncActiveCategory();
    };

    const tryAttach = () => {
      if (useDocumentScroll) {
        attachWindow();
        return;
      }
      const root = scrollRootRef.current;
      if (root) {
        attachElement(root);
        return;
      }
      waitFrame = requestAnimationFrame(tryAttach);
    };

    tryAttach();

    return () => {
      if (waitFrame != null) cancelAnimationFrame(waitFrame);
      if (attachedElement) {
        attachedElement.removeEventListener('scroll', handleScroll);
      }
      if (attachedWindow) {
        window.removeEventListener('scroll', handleScroll);
      }
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, handleScroll, syncActiveCategory, scrollRootRef, useDocumentScroll]);

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
