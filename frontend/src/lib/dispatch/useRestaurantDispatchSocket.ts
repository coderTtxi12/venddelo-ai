'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type RestaurantDispatchSocketEvent = { type: 'dispatch.updated' };

export type RestaurantDispatchSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type UseRestaurantDispatchSocketOptions = {
  onEvent: (event: RestaurantDispatchSocketEvent) => void;
  onStatusChange?: (status: RestaurantDispatchSocketStatus) => void;
  onReconnect?: () => void;
};

function buildRestaurantDispatchSocketUrl(restaurantId: string, token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  const params = new URLSearchParams({ token });
  return `${wsBase}/ws/restaurants/${restaurantId}/dispatch?${params}`;
}

export function useRestaurantDispatchSocket(
  restaurantId: string | null,
  accessToken: string | null,
  options: UseRestaurantDispatchSocketOptions,
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

      socket = new WebSocket(buildRestaurantDispatchSocketUrl(restaurantId, accessToken));

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
          const payload = JSON.parse(String(message.data)) as RestaurantDispatchSocketEvent;
          if (payload.type !== 'dispatch.updated') return;
          onEventRef.current(payload);
        } catch (error) {
          console.warn('restaurant dispatch ws parse error', error);
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
