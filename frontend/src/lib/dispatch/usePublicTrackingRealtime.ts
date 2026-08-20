'use client';

import { useEffect, useRef, useState } from 'react';
import type { DispatchStatus } from '@/lib/api/dispatch';
import { createClient } from '@/lib/supabase/client';
import {
  shouldConsumeTrackingRealtime,
  trackingBroadcastTopic,
  type TrackingLocationPayload,
} from './publicTrackingRealtime';

export type PublicTrackingRealtimeEvent =
  | { type: 'tracking.updated' }
  | ({ type: 'tracking.location' } & TrackingLocationPayload);

export type PublicTrackingRealtimeStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline';

type Options = {
  onEvent: (event: PublicTrackingRealtimeEvent) => void;
  onStatusChange?: (status: PublicTrackingRealtimeStatus) => void;
  onReconnect?: () => void;
};

export function usePublicTrackingRealtime(
  token: string | null,
  status: DispatchStatus | null,
  options: Options,
) {
  const onEventRef = useRef(options.onEvent);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onReconnectRef = useRef(options.onReconnect);
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

  const consume = shouldConsumeTrackingRealtime({ status, visibilityState });

  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    if (!token || !consume) {
      onStatusChangeRef.current?.('offline');
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    onStatusChangeRef.current?.('connecting');

    const channel = supabase.channel(trackingBroadcastTopic(token), {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'updated' }, () => {
        onEventRef.current({ type: 'tracking.updated' });
      })
      .on('broadcast', { event: 'location' }, ({ payload }) => {
        const body = payload as TrackingLocationPayload;
        if (typeof body?.latitude !== 'number' || typeof body?.longitude !== 'number') {
          return;
        }
        onEventRef.current({
          type: 'tracking.location',
          latitude: body.latitude,
          longitude: body.longitude,
          eta_seconds: typeof body.eta_seconds === 'number' ? body.eta_seconds : null,
        });
      })
      .subscribe((channelStatus) => {
        if (cancelled) return;
        if (channelStatus === 'SUBSCRIBED') {
          if (hasConnectedOnceRef.current) onReconnectRef.current?.();
          hasConnectedOnceRef.current = true;
          onStatusChangeRef.current?.('live');
          return;
        }
        if (
          channelStatus === 'CHANNEL_ERROR' ||
          channelStatus === 'TIMED_OUT' ||
          channelStatus === 'CLOSED'
        ) {
          onStatusChangeRef.current?.(
            hasConnectedOnceRef.current ? 'reconnecting' : 'offline',
          );
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      onStatusChangeRef.current?.('offline');
    };
  }, [token, consume]);

  return { visibilityState };
}
