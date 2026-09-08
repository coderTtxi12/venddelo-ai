export const DOCUMENT_SCROLL_ROOT = 'document' as const;
export type MenuScrollRoot = HTMLElement | typeof DOCUMENT_SCROLL_ROOT;

export function getObserverRoot(root: MenuScrollRoot): Element | null {
  return root === DOCUMENT_SCROLL_ROOT ? null : root;
}

export function getScrollPosition(root: MenuScrollRoot): number {
  if (root === DOCUMENT_SCROLL_ROOT) return window.scrollY;
  return root.scrollTop;
}

export function scrollMenuTo(root: MenuScrollRoot, options: ScrollToOptions): void {
  if (root === DOCUMENT_SCROLL_ROOT) {
    window.scrollTo(options);
    return;
  }
  root.scrollTo(options);
}

/** Offset top of `section` within `scrollRoot`'s scroll coordinate space. */
export function getSectionOffsetTop(section: HTMLElement, scrollRoot: MenuScrollRoot): number {
  if (scrollRoot === DOCUMENT_SCROLL_ROOT) {
    return section.getBoundingClientRect().top + window.scrollY;
  }
  const sectionRect = section.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  return sectionRect.top - rootRect.top + scrollRoot.scrollTop;
}

/**
 * Scroll-position anchor (px from top of scroll content) used to pick the active category.
 * Uses the live bottom edge of the category bar when available so sticky + non-sticky both work.
 */
export function getCategoryScrollAnchorPosition(
  scrollRoot: MenuScrollRoot,
  options: {
    categoryBar?: HTMLElement | null;
    heroCollapsed: boolean;
    pinnedBarHeight: number;
    categoryBarHeight: number;
    extra?: number;
  },
): number {
  const { categoryBar, heroCollapsed, pinnedBarHeight, categoryBarHeight, extra = 8 } = options;
  const scrollTop = getScrollPosition(scrollRoot);

  if (categoryBar) {
    const barRect = categoryBar.getBoundingClientRect();
    if (scrollRoot === DOCUMENT_SCROLL_ROOT) {
      return scrollTop + barRect.bottom + extra;
    }
    const rootRect = scrollRoot.getBoundingClientRect();
    return scrollTop + (barRect.bottom - rootRect.top) + extra;
  }

  const offsetFromViewportTop =
    (heroCollapsed ? pinnedBarHeight : 0) + categoryBarHeight + extra;
  return scrollTop + offsetFromViewportTop;
}

/**
 * Returns the category whose section header is at or above the scroll anchor line.
 * Iterates in document order so the last matching section wins while scrolling down.
 */
export function resolveActiveCategoryId(
  categoryIds: readonly string[],
  getSection: (id: string) => HTMLElement | null | undefined,
  scrollRoot: MenuScrollRoot,
  scrollAnchorPx: number,
): string | null {
  if (categoryIds.length === 0) return null;

  let activeId = categoryIds[0];

  for (const id of categoryIds) {
    const section = getSection(id);
    if (!section) continue;
    const top = getSectionOffsetTop(section, scrollRoot);
    if (top <= scrollAnchorPx + 2) {
      activeId = id;
    }
  }

  return activeId;
}

/** @deprecated Use getCategoryScrollAnchorPosition */
/** @deprecated Use getCategoryScrollAnchorPosition */
export function getCategoryScrollAnchorOffset(options: {
  heroCollapsed: boolean;
  pinnedBarHeight: number;
  categoryBarHeight: number;
  extra?: number;
}): number {
  const { heroCollapsed, pinnedBarHeight, categoryBarHeight, extra = 16 } = options;
  return (heroCollapsed ? pinnedBarHeight : 0) + categoryBarHeight + extra;
}

/** Centers a horizontal category tab inside a scrollable tab bar. */
export function scrollCategoryTabIntoView(
  bar: HTMLElement,
  tab: HTMLElement,
  behavior: ScrollBehavior = 'smooth',
): void {
  const targetScroll = tab.offsetLeft - bar.clientWidth / 2 + tab.offsetWidth / 2;
  bar.scrollTo({
    left: Math.max(0, targetScroll),
    behavior,
  });
}
