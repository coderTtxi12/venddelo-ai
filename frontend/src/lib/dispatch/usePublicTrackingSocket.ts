'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type PublicTrackingSocketEvent =
  | { type: 'tracking.updated'; tracking: import('@/lib/api/dispatch').PublicDispatchTracking }
  | {
      type: 'tracking.location';
      latitude: number;
      longitude: number;
      eta_seconds: number | null;
    };

export type PublicTrackingSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type UsePublicTrackingSocketOptions = {
  onEvent: (event: PublicTrackingSocketEvent) => void;
  onStatusChange?: (status: PublicTrackingSocketStatus) => void;
  onReconnect?: () => void;
};

function buildPublicTrackingSocketUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  return `${wsBase}/ws/public/dispatch-tracking/${encodeURIComponent(token)}`;
}

export function usePublicTrackingSocket(
  token: string | null,
  options: UsePublicTrackingSocketOptions,
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
    if (!token) {
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

      socket = new WebSocket(buildPublicTrackingSocketUrl(token));

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
          const payload = JSON.parse(String(message.data)) as PublicTrackingSocketEvent;
          if (payload.type !== 'tracking.updated' && payload.type !== 'tracking.location') {
            return;
          }
          onEventRef.current(payload);
        } catch (error) {
          console.warn('public tracking ws parse error', error);
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
  }, [token]);
}
