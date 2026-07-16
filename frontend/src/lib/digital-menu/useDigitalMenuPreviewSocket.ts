'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type DigitalMenuPreviewSocketEvent = {
  type: 'digital_menu.changed';
};

function buildDigitalMenuPreviewSocketUrl(restaurantId: string, token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  const params = new URLSearchParams({ token });
  return `${wsBase}/ws/restaurants/${restaurantId}/digital-menu?${params}`;
}

export function useDigitalMenuPreviewSocket(
  restaurantId: string | null,
  accessToken: string | null,
  onEvent: (event: DigitalMenuPreviewSocketEvent) => void,
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
      socket = new WebSocket(buildDigitalMenuPreviewSocketUrl(restaurantId, accessToken));

      socket.onopen = () => {
        retryMs = 1_000;
      };

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as DigitalMenuPreviewSocketEvent;
          if (payload.type !== 'digital_menu.changed') return;
          onEventRef.current(payload);
        } catch (error) {
          console.warn('digital menu preview ws parse error', error);
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
