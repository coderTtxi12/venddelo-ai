'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type DispatchMonitorSocketEvent = { type: 'monitor.updated' };

export type DispatchMonitorSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type UseDispatchMonitorSocketOptions = {
  onEvent: (event: DispatchMonitorSocketEvent) => void;
  onStatusChange?: (status: DispatchMonitorSocketStatus) => void;
  onReconnect?: () => void;
  /** Debounce REST refetch triggered by WS events (ms). Default 400. */
  eventDebounceMs?: number;
};

function buildDispatchMonitorSocketUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  const params = new URLSearchParams({ token });
  return `${wsBase}/ws/delivery-providers/me/dispatch?${params}`;
}

export function useDispatchMonitorSocket(
  accessToken: string | null,
  options: UseDispatchMonitorSocketOptions,
) {
  const onEventRef = useRef(options.onEvent);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onReconnectRef = useRef(options.onReconnect);
  const debounceMs = options.eventDebounceMs ?? 400;

  useEffect(() => {
    onEventRef.current = options.onEvent;
    onStatusChangeRef.current = options.onStatusChange;
    onReconnectRef.current = options.onReconnect;
  });

  useEffect(() => {
    if (!accessToken) {
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
    let pending = false;

    onStatusChangeRef.current?.('connecting');

    const flushEvent = () => {
      if (cancelled || !pending || inFlight) return;
      pending = false;
      inFlight = true;
      Promise.resolve(
        onEventRef.current({ type: 'monitor.updated' }),
      ).finally(() => {
        inFlight = false;
        if (pending) {
          eventTimer = window.setTimeout(flushEvent, debounceMs);
        }
      });
    };

    const queueEvent = () => {
      pending = true;
      if (eventTimer != null) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(flushEvent, debounceMs);
    };

    const connect = () => {
      if (cancelled) return;
      if (hasConnectedOnce) {
        onStatusChangeRef.current?.('reconnecting');
      }

      socket = new WebSocket(buildDispatchMonitorSocketUrl(accessToken));

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
          const payload = JSON.parse(String(message.data)) as DispatchMonitorSocketEvent;
          if (payload.type !== 'monitor.updated') return;
          queueEvent();
        } catch (error) {
          console.warn('dispatch monitor ws parse error', error);
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
  }, [accessToken, debounceMs]);
}
