'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { cartItemCount, cartSubtotalCents, findMatchingLineIndex } from './cartMath';
import { readCartFromStorage, writeCartToStorage } from './storage';
import type { AddToCartInput, PublicMenuCartLine } from './types';

type CartStore = {
  lines: PublicMenuCartLine[];
};

const listeners = new Set<() => void>();
const stores = new Map<string, CartStore>();

/** Stable empty snapshot for SSR — must keep the same reference across getServerSnapshot calls. */
const SERVER_CART_LINES: PublicMenuCartLine[] = [];

function createLineId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStore(subdomain: string): CartStore {
  let store = stores.get(subdomain);
  if (!store) {
    store = { lines: readCartFromStorage(subdomain)?.lines ?? [] };
    stores.set(subdomain, store);
  }
  return store;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(subdomain: string): void {
  const store = getStore(subdomain);
  writeCartToStorage(subdomain, { lines: store.lines, updatedAt: Date.now() });
  for (const listener of listeners) {
    listener();
  }
}

function getSnapshot(subdomain: string): PublicMenuCartLine[] {
  return getStore(subdomain).lines;
}

function getServerSnapshot(): PublicMenuCartLine[] {
  return SERVER_CART_LINES;
}

export function usePublicMenuCart(subdomain: string) {
  const lines = useSyncExternalStore(
    subscribe,
    () => getSnapshot(subdomain),
    getServerSnapshot,
  );

  const addItem = useCallback(
    (input: AddToCartInput) => {
      const store = getStore(subdomain);
      const matchIndex = findMatchingLineIndex(
        store.lines,
        input.productId,
        input.selections,
        input.notes,
      );

      if (matchIndex >= 0) {
        store.lines = store.lines.map((line, index) =>
          index === matchIndex
            ? { ...line, quantity: line.quantity + input.quantity, addedAt: Date.now() }
            : line,
        );
      } else {
        store.lines = [
          ...store.lines,
          {
            ...input,
            id: createLineId(),
            addedAt: Date.now(),
          },
        ];
      }

      emitChange(subdomain);
    },
    [subdomain],
  );

  const updateLineQuantity = useCallback(
    (lineId: string, quantity: number) => {
      const store = getStore(subdomain);
      store.lines =
        quantity <= 0
          ? store.lines.filter((line) => line.id !== lineId)
          : store.lines.map((line) => (line.id === lineId ? { ...line, quantity } : line));
      emitChange(subdomain);
    },
    [subdomain],
  );

  const removeLine = useCallback(
    (lineId: string) => {
      const store = getStore(subdomain);
      store.lines = store.lines.filter((line) => line.id !== lineId);
      emitChange(subdomain);
    },
    [subdomain],
  );

  const clearCart = useCallback(() => {
    const store = getStore(subdomain);
    store.lines = [];
    emitChange(subdomain);
  }, [subdomain]);

  const pruneInvalidLines = useCallback(
    (validProductIds: Iterable<string>) => {
      const valid = new Set(validProductIds);
      const store = getStore(subdomain);
      const next = store.lines.filter((line) => valid.has(line.productId));
      if (next.length !== store.lines.length) {
        store.lines = next;
        emitChange(subdomain);
      }
    },
    [subdomain],
  );

  const itemCount = useMemo(() => cartItemCount(lines), [lines]);
  const subtotalCents = useMemo(() => cartSubtotalCents(lines), [lines]);

  return {
    lines,
    itemCount,
    subtotalCents,
    addItem,
    updateLineQuantity,
    removeLine,
    clearCart,
    pruneInvalidLines,
  };
}
