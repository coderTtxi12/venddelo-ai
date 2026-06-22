'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Promotion } from '@/lib/api/types';
import {
  formatCountdownDuration,
  getPromotionCountdownDeadline,
  promotionCountdownLabel,
  type PromotionCountdownContext,
  type PromotionCountdownDeadline,
} from '@/lib/promotions/promotionCountdown';

export type PromotionCountdownState = {
  deadline: PromotionCountdownDeadline;
  label: string;
  display: string;
  remainingMs: number;
  isExpired: boolean;
};

export function usePromotionCountdown(
  promotion: Promotion,
  timezone: string,
  context?: PromotionCountdownContext,
): PromotionCountdownState | null {
  const [now, setNow] = useState(() => Date.now());

  const minuteBucket = Math.floor(now / 60_000);
  const schedulesKey = context?.schedules.map((s) => `${s.day_of_week}:${s.closes_at}`).join('|') ?? '';
  const servicesKey = context?.enabledServices.join(',') ?? '';

  const deadlineInfo = useMemo(
    () => getPromotionCountdownDeadline(promotion, new Date(now), timezone, context),
    [promotion, timezone, minuteBucket, schedulesKey, servicesKey],
  );

  const deadlineMs = deadlineInfo?.deadline.getTime() ?? null;

  useEffect(() => {
    if (deadlineMs == null) return undefined;

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [deadlineMs]);

  if (!deadlineInfo) return null;

  const remainingMs = deadlineInfo.deadline.getTime() - now;
  const isExpired = remainingMs <= 0;

  return {
    deadline: deadlineInfo,
    label: promotionCountdownLabel(deadlineInfo.kind),
    display: isExpired ? '00:00:00' : formatCountdownDuration(remainingMs),
    remainingMs,
    isExpired,
  };
}
