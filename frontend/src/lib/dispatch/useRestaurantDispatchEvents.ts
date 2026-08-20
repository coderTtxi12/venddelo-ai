'use client';

import { useEffect, useRef, useState } from 'react';
import { isFetchAbortError } from '@/lib/api/assistantStream';
import { ApiError } from '@/lib/api/types';
import {
  shouldOpenRestaurantDispatchSse,
  type RestaurantDispatchSseEvent,
} from './restaurantDispatchSse';
import { streamRestaurantDispatchEvents } from './streamRestaurantDispatchEvents';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';
const STREAM_MAX_MS = 240_000;

export type RestaurantDispatchEvent = RestaurantDispatchSseEvent;
export type RestaurantDispatchStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type Options = {
  onEvent: (event: RestaurantDispatchEvent) => void;
  onStatusChange?: (status: RestaurantDispatchStreamStatus) => void;
  onReconnect?: () => void;
  eventDebounceMs?: number;
};

export function useRestaurantDispatchEvents(
  restaurantId: string | null,
  accessToken: string | null,
  options: Options,
) {
  const onEventRef = useRef(options.onEvent);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onReconnectRef = useRef(options.onReconnect);
  const debounceMs = options.eventDebounceMs ?? 300;
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(() =>
    typeof document === 'undefined' ? 'visible' : document.visibilityState,
  );

  useEffect(() => {
    onEventRef.current = options.onEvent;
    onStatusChangeRef.current = options.onStatusChange;
    onReconnectRef.current = options.onReconnect;
  });

  useEffect(() => {
    const onVisibility = () => setVisibilityState(document.visibilityState);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const open = shouldOpenRestaurantDispatchSse({
    restaurantId,
    accessToken,
    visibilityState,
  });

  useEffect(() => {
    if (!open || !restaurantId || !accessToken) {
      onStatusChangeRef.current?.('offline');
      return;
    }

    let cancelled = false;
    let stopRetry = false;
    let retryTimer: number | null = null;
    let eventTimer: number | null = null;
    let maxTimer: number | null = null;
    let abort: AbortController | null = null;
    let retryMs = 1_000;
    let hasConnectedOnce = false;
    let inFlight = false;
    let pendingEvent: RestaurantDispatchEvent | null = null;

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

    const queueEvent = (event: RestaurantDispatchEvent) => {
      pendingEvent = event;
      if (eventTimer != null) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(flushEvent, debounceMs);
    };

    const connect = () => {
      if (cancelled || stopRetry) return;
      abort?.abort();
      abort = new AbortController();
      if (hasConnectedOnce) onStatusChangeRef.current?.('reconnecting');
      else onStatusChangeRef.current?.('connecting');

      if (maxTimer != null) window.clearTimeout(maxTimer);
      maxTimer = window.setTimeout(() => {
        abort?.abort();
      }, STREAM_MAX_MS);

      void streamRestaurantDispatchEvents({
        apiUrl: API_URL,
        restaurantId,
        accessToken,
        signal: abort.signal,
        onOpen: () => {
          if (cancelled) return;
          retryMs = 1_000;
          if (hasConnectedOnce) onReconnectRef.current?.();
          hasConnectedOnce = true;
          onStatusChangeRef.current?.('live');
        },
        onEvent: queueEvent,
      })
        .catch((error) => {
          if (cancelled || isFetchAbortError(error) || abort?.signal.aborted) return;
          if (
            error instanceof ApiError &&
            (error.httpStatus === 401 || error.httpStatus === 403 || error.httpStatus === 404)
          ) {
            stopRetry = true;
            onStatusChangeRef.current?.('offline');
            return;
          }
          console.warn('restaurant dispatch sse error', error);
        })
        .finally(() => {
          if (cancelled || stopRetry) return;
          onStatusChangeRef.current?.('reconnecting');
          retryTimer = window.setTimeout(() => {
            retryMs = Math.min(retryMs * 2, 30_000);
            connect();
          }, retryMs);
        });
    };

    connect();

    return () => {
      cancelled = true;
      abort?.abort();
      if (retryTimer != null) window.clearTimeout(retryTimer);
      if (eventTimer != null) window.clearTimeout(eventTimer);
      if (maxTimer != null) window.clearTimeout(maxTimer);
      onStatusChangeRef.current?.('offline');
    };
  }, [open, restaurantId, accessToken, debounceMs]);

  return { visibilityState };
}
