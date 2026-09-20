import assert from 'node:assert/strict';
import test from 'node:test';

import { observeOnceVisible } from './observeOnceVisible.ts';

type FakeEntry = { isIntersecting: boolean };

test('loads immediately when IntersectionObserver is unavailable', () => {
  const original = globalThis.IntersectionObserver;
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  let calls = 0;

  try {
    const stop = observeOnceVisible({} as Element, () => {
      calls += 1;
    });
    assert.equal(calls, 1);
    stop();
  } finally {
    globalThis.IntersectionObserver = original;
  }
});

test('does not load until the element intersects, then fires once', () => {
  const original = globalThis.IntersectionObserver;
  const observed: Element[] = [];
  const disconnects: number[] = [];
  let notify: ((entries: FakeEntry[]) => void) | null = null;
  let constructedWith: IntersectionObserverInit | undefined;

  class FakeObserver {
    constructor(callback: (entries: FakeEntry[]) => void, options?: IntersectionObserverInit) {
      notify = callback;
      constructedWith = options;
    }

    observe(element: Element) {
      observed.push(element);
    }

    disconnect() {
      disconnects.push(1);
    }
  }

  globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;

  try {
    const element = { id: 'tracking-map' } as unknown as Element;
    let calls = 0;
    const stop = observeOnceVisible(element, () => {
      calls += 1;
    });

    assert.deepEqual(observed, [element]);
    assert.equal(calls, 0);
    assert.equal(constructedWith?.rootMargin, '120px 0px');

    notify?.([{ isIntersecting: false }]);
    assert.equal(calls, 0);

    notify?.([{ isIntersecting: true }]);
    assert.equal(calls, 1);
    assert.equal(disconnects.length, 1);

    notify?.([{ isIntersecting: true }]);
    assert.equal(calls, 1);

    stop();
  } finally {
    globalThis.IntersectionObserver = original;
  }
});

test('cleanup disconnects the observer before it becomes visible', () => {
  const original = globalThis.IntersectionObserver;
  let disconnects = 0;

  class FakeObserver {
    constructor(_callback: (entries: FakeEntry[]) => void) {}
    observe() {}
    disconnect() {
      disconnects += 1;
    }
  }

  globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;

  try {
    const stop = observeOnceVisible({} as Element, () => {
      throw new Error('should not load after cleanup');
    });
    stop();
    assert.equal(disconnects, 1);
  } finally {
    globalThis.IntersectionObserver = original;
  }
});
