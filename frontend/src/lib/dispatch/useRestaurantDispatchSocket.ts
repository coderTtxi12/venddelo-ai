'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type RestaurantDispatchSocketEvent = { type: 'dispatch.updated' };

export type RestaurantDispatchSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type UseRestaurantDispatchSocketOptions = {
  onEvent: (event: RestaurantDispatchSocketEvent) => void;
  onStatusChange?: (status: RestaurantDispatchSocketStatus) => void;
  onReconnect?: () => void;
  /** Debounce REST refetch triggered by WS events (ms). Default 300. */
  eventDebounceMs?: number;
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
  const debounceMs = options.eventDebounceMs ?? 300;

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
    let eventTimer: number | null = null;
    let retryMs = 1_000;
    let hasConnectedOnce = false;
    let inFlight = false;
    let pendingEvent: RestaurantDispatchSocketEvent | null = null;

    onStatusChangeRef.current?.('connecting');

    const flushEvent = () => {
      if (cancelled || !pendingEvent || inFlight) return;
      const event = pendingEvent;
      pendingEvent = null;
      inFlight = true;
      Promise.resolve(onEventRef.current(event)).finally(() => {
        inFlight = false;
        if (pendingEvent) {
          eventTimer = window.setTimeout(flushEvent, debounceMs);
        }
      });
    };

    const queueEvent = (event: RestaurantDispatchSocketEvent) => {
      pendingEvent = event;
      if (eventTimer != null) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(flushEvent, debounceMs);
    };

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
          queueEvent(payload);
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
      if (eventTimer != null) window.clearTimeout(eventTimer);
      socket?.close();
      onStatusChangeRef.current?.('offline');
    };
  }, [restaurantId, accessToken, debounceMs]);
}
