'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const NEAR_BOTTOM_THRESHOLD_PX = 96;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type UseChatAutoScrollOptions = {
  enabled?: boolean;
};

export function useChatAutoScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  triggers: unknown[],
  options: UseChatAutoScrollOptions = {},
) {
  const { enabled = true } = options;
  const stickToBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth', force = false) => {
      const container = containerRef.current;
      if (!container || !enabled || (!force && !stickToBottomRef.current)) return;

      const resolvedBehavior = prefersReducedMotion() ? 'auto' : behavior;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        container.scrollTo({ top: container.scrollHeight, behavior: resolvedBehavior });
      });
    },
    [containerRef, enabled],
  );

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
  }, [containerRef]);

  const pinToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      stickToBottomRef.current = true;
      scrollToBottom(behavior, true);
    },
    [scrollToBottom],
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    scrollToBottom('auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit trigger list from caller
  }, [...triggers, enabled, scrollToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !enabled) return;

    const observer = new ResizeObserver(() => {
      scrollToBottom('auto');
    });

    observer.observe(content);
    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [contentRef, enabled, scrollToBottom]);

  return { pinToBottom, handleScroll };
}
