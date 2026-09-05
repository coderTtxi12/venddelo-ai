'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import {
  resolveRestaurantClosingCountdown,
  restaurantClosingContextKey,
  type RestaurantClosingCountdownState,
} from '@/lib/digital-menu/restaurantClosingCountdown';

export function useRestaurantClosingCountdown(
  timezone: string | undefined,
  context?: PromotionCountdownContext | null,
): RestaurantClosingCountdownState | null {
  const [now, setNow] = useState(() => Date.now());

  const minuteBucket = Math.floor(now / 60_000);
  const schedulesKey = context
    ? restaurantClosingContextKey(context.schedules, context.enabledServices)
    : '';

  const deadlineMs = useMemo(() => {
    if (!timezone || !context) return null;
    const state = resolveRestaurantClosingCountdown(new Date(now), timezone, context);
    return state?.deadline.getTime() ?? null;
  }, [timezone, schedulesKey, minuteBucket]);

  useEffect(() => {
    if (deadlineMs == null) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [deadlineMs]);

  if (!timezone || !context) return null;
  return resolveRestaurantClosingCountdown(new Date(now), timezone, context);
}
