import type { DispatchStatus, PublicDispatchTracking } from '@/lib/api/dispatch';

export const TERMINAL_TRACKING_STATUSES: ReadonlySet<DispatchStatus> = new Set([
  'delivered',
  'cancelled',
]);

export type TrackingLocationPayload = {
  latitude: number;
  longitude: number;
  eta_seconds: number | null;
};

export function trackingBroadcastTopic(token: string): string {
  return `tracking:${token}`;
}

export function shouldConsumeTrackingRealtime(input: {
  status: DispatchStatus | null;
  visibilityState: DocumentVisibilityState;
}): boolean {
  if (input.status == null) return false;
  if (input.visibilityState !== 'visible') return false;
  return !TERMINAL_TRACKING_STATUSES.has(input.status);
}

export function applyTrackingLocation(
  current: PublicDispatchTracking,
  event: TrackingLocationPayload,
): PublicDispatchTracking {
  if (!current.rider) return current;
  return {
    ...current,
    eta_seconds: event.eta_seconds,
    rider: {
      ...current.rider,
      latitude: event.latitude,
      longitude: event.longitude,
    },
  };
}
