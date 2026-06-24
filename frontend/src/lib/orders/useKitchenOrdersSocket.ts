'use client';

import { useEffect, useRef } from 'react';
import type { Order } from '@/lib/api/types';
import { sortOrdersNewestFirst } from '@/lib/orders/orderDisplay';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type KitchenOrderSocketEvent =
  | { type: 'order.created'; order: Order }
  | { type: 'order.updated'; order: Order };

function buildKitchenOrdersSocketUrl(restaurantId: string, token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  const params = new URLSearchParams({ token });
  return `${wsBase}/ws/restaurants/${restaurantId}/orders?${params}`;
}

export function applyKitchenOrderSocketEvent(
  current: Order[],
  event: KitchenOrderSocketEvent,
): Order[] {
  const incoming = event.order;
  const without = current.filter((order) => order.id !== incoming.id);
  return sortOrdersNewestFirst([incoming, ...without]);
}

export function useKitchenOrdersSocket(
  restaurantId: string | null,
  accessToken: string | null,
  onEvent: (event: KitchenOrderSocketEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!restaurantId || !accessToken) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryMs = 1_000;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(buildKitchenOrdersSocketUrl(restaurantId, accessToken));

      socket.onopen = () => {
        retryMs = 1_000;
      };

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as KitchenOrderSocketEvent;
          if (payload.type !== 'order.created' && payload.type !== 'order.updated') return;
          onEventRef.current(payload);
        } catch (error) {
          console.warn('kitchen orders ws parse error', error);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        retryTimer = window.setTimeout(() => {
          retryMs = Math.min(retryMs * 2, 30_000);
          connect();
        }, retryMs);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [restaurantId, accessToken]);
}
