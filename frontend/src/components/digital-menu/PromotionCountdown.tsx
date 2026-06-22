'use client';

import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import type { Promotion } from '@/lib/api/types';
import { usePromotionCountdown } from '@/hooks/usePromotionCountdown';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import styles from './PromotionCountdown.module.css';

type PromotionCountdownProps = {
  promotion: Promotion;
  timezone: string;
  countdownContext?: PromotionCountdownContext;
  variant: 'banner' | 'detail' | 'compact';
};

const ICON_SIZE: Record<PromotionCountdownProps['variant'], number> = {
  banner: 14,
  detail: 18,
  compact: 13,
};

export function PromotionCountdown({
  promotion,
  timezone,
  countdownContext,
  variant,
}: PromotionCountdownProps) {
  const countdown = usePromotionCountdown(promotion, timezone, countdownContext);

  if (!countdown || countdown.isExpired) return null;

  const isUrgent = countdown.remainingMs <= 3_600_000;
  const variantClass =
    variant === 'banner'
      ? styles.countdownBanner
      : variant === 'compact'
        ? styles.countdownCompact
        : styles.countdownDetail;

  return (
    <div
      className={`${styles.countdown} ${variantClass} ${isUrgent ? styles.countdownUrgent : ''}`}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${countdown.label} ${countdown.display}`}
    >
      <span className={styles.countdownIcon} aria-hidden>
        <AccessTimeOutlinedIcon sx={{ fontSize: ICON_SIZE[variant] }} />
      </span>
      <span className={styles.countdownCopy}>
        {variant !== 'compact' ? (
          <span className={styles.countdownLabel}>{countdown.label}</span>
        ) : null}
        <span className={styles.countdownDigits}>{countdown.display}</span>
      </span>
    </div>
  );
}
