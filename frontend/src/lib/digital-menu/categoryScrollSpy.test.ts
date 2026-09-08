import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOCUMENT_SCROLL_ROOT,
  getCategoryScrollAnchorPosition,
  getObserverRoot,
  getScrollPosition,
  getSectionOffsetTop,
  resolveActiveCategoryId,
  scrollMenuTo,
} from './categoryScrollSpy.ts';

type Rect = { top: number; bottom: number };

function fakeEl(rect: Rect, scrollTop = 0): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({
        top: rect.top,
        bottom: rect.bottom,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect,
    scrollTop,
    scrollTo() {},
  } as unknown as HTMLElement;
}

test('getObserverRoot returns null for document mode', () => {
  assert.equal(getObserverRoot(DOCUMENT_SCROLL_ROOT), null);
});

test('getSectionOffsetTop uses element scroll coordinates', () => {
  const root = fakeEl({ top: 100, bottom: 500 }, 40);
  const section = fakeEl({ top: 180, bottom: 220 });
  // 180 - 100 + 40 = 120
  assert.equal(getSectionOffsetTop(section, root), 120);
});

test('getSectionOffsetTop uses window.scrollY in document mode', () => {
  const previous = globalThis.window;
  (globalThis as { window: { scrollY: number } }).window = { scrollY: 250 };
  try {
    const section = fakeEl({ top: 80, bottom: 120 });
    assert.equal(getSectionOffsetTop(section, DOCUMENT_SCROLL_ROOT), 330);
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});

test('getCategoryScrollAnchorPosition uses live category bar bottom in document mode', () => {
  const previous = globalThis.window;
  (globalThis as { window: { scrollY: number } }).window = { scrollY: 200 };
  try {
    const bar = fakeEl({ top: 48, bottom: 100 });
    assert.equal(
      getCategoryScrollAnchorPosition(DOCUMENT_SCROLL_ROOT, {
        categoryBar: bar,
        heroCollapsed: true,
        pinnedBarHeight: 48,
        categoryBarHeight: 52,
        extra: 8,
      }),
      200 + 100 + 8,
    );
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});

test('resolveActiveCategoryId works with document scroll root', () => {
  const previous = globalThis.window;
  (globalThis as { window: { scrollY: number } }).window = { scrollY: 0 };
  try {
    const sections: Record<string, HTMLElement> = {
      a: fakeEl({ top: 0, bottom: 10 }),
      b: fakeEl({ top: 300, bottom: 310 }),
    };
    const id = resolveActiveCategoryId(
      ['a', 'b'],
      (key) => sections[key],
      DOCUMENT_SCROLL_ROOT,
      50,
    );
    assert.equal(id, 'a');
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});

test('getScrollPosition and scrollMenuTo use window in document mode', () => {
  let scrolledTo: ScrollToOptions | null = null;
  const previous = globalThis.window;
  (globalThis as {
    window: { scrollY: number; scrollTo: (o: ScrollToOptions) => void };
  }).window = {
    scrollY: 12,
    scrollTo(o) {
      scrolledTo = o;
    },
  };
  try {
    assert.equal(getScrollPosition(DOCUMENT_SCROLL_ROOT), 12);
    scrollMenuTo(DOCUMENT_SCROLL_ROOT, { top: 0, behavior: 'auto' });
    assert.deepEqual(scrolledTo, { top: 0, behavior: 'auto' });
  } finally {
    (globalThis as { window: typeof previous }).window = previous;
  }
});
