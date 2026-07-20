'use client';

import { useEffect, useRef } from 'react';
import type { Order } from '@/lib/api/types';
import { sortOrdersNewestFirst } from '@/lib/orders/orderDisplay';
import {
  matchesOrderStatusFilter,
  type OrderStatusFilter,
} from '@/lib/orders/orderStatus';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type KitchenOrderSocketEvent =
  | { type: 'order.created'; order: Order }
  | { type: 'order.updated'; order: Order };

export type KitchenSocketConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type UseKitchenOrdersSocketOptions = {
  onEvent: (event: KitchenOrderSocketEvent) => void;
  onStatusChange?: (status: KitchenSocketConnectionStatus) => void;
  onReconnect?: () => void;
};

function buildKitchenOrdersSocketUrl(restaurantId: string, token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  const params = new URLSearchParams({ token });
  return `${wsBase}/ws/restaurants/${restaurantId}/orders?${params}`;
}

export function applyKitchenOrderSocketEvent(
  current: Order[],
  event: KitchenOrderSocketEvent,
  filter?: OrderStatusFilter,
): Order[] {
  const incoming = event.order;
  const without = current.filter((order) => order.id !== incoming.id);
  if (filter && !matchesOrderStatusFilter(incoming.status, filter)) {
    return without;
  }
  return sortOrdersNewestFirst([incoming, ...without]);
}

export function useKitchenOrdersSocket(
  restaurantId: string | null,
  accessToken: string | null,
  options: UseKitchenOrdersSocketOptions,
) {
  const onEventRef = useRef(options.onEvent);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onReconnectRef = useRef(options.onReconnect);

  useEffect(() => {
    onEventRef.current = options.onEvent;
    onStatusChangeRef.current = options.onStatusChange;
    onReconnectRef.current = options.onReconnect;
  });

  useEffect(() => {
    if (!restaurantId || !accessToken) {
      onStatusChangeRef.current?.('offline');
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryMs = 1_000;
    let hasConnectedOnce = false;

    onStatusChangeRef.current?.('connecting');

    const connect = () => {
      if (cancelled) return;
      if (hasConnectedOnce) {
        onStatusChangeRef.current?.('reconnecting');
      }

      socket = new WebSocket(buildKitchenOrdersSocketUrl(restaurantId, accessToken));

      socket.onopen = () => {
        retryMs = 1_000;
        if (hasConnectedOnce) {
          onReconnectRef.current?.();
        }
        hasConnectedOnce = true;
        onStatusChangeRef.current?.('live');
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
        onStatusChangeRef.current?.('reconnecting');
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
      onStatusChangeRef.current?.('offline');
    };
  }, [restaurantId, accessToken]);
}
