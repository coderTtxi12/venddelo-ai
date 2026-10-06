'use client';

import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import type { Product } from '@/lib/api/types';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { productOutsideScheduleCopy } from '@/lib/menu/productMenuSchedule';
import { ProductLowStockSignals } from '@/components/digital-menu/ProductLowStockSignals';
import { useMenuScheduleClock } from '@/components/digital-menu/MenuScheduleClock';
import styles from '@/components/pages/DigitalMenuPage.module.css';

export function useProductOutsideSchedule(product: Product) {
  const { now, timezone } = useMenuScheduleClock();
  return productOutsideScheduleCopy(product, now, timezone);
}

export function ProductScheduleNote({ product }: { product: Product }) {
  const copy = useProductOutsideSchedule(product);
  if (!copy) return null;

  return (
    <div className={styles.productScheduleNote}>
      <span className={styles.productScheduleBadge}>
        <ScheduleOutlinedIcon sx={{ fontSize: 12 }} aria-hidden />
        <span>{copy.badge}</span>
      </span>
      <span className={styles.productScheduleWhen}>{copy.when}</span>
    </div>
  );
}

export function ProductScheduleTitleBadge({ product }: { product: Product }) {
  const copy = useProductOutsideSchedule(product);
  if (!copy) return null;

  return (
    <span className={styles.productScheduleBadge}>
      <ScheduleOutlinedIcon sx={{ fontSize: 12 }} aria-hidden />
      <span>{copy.badge}</span>
    </span>
  );
}

/** Schedule note replaces scarcity signals while the product cannot be ordered. */
export function ProductAvailabilitySignals({
  product,
  hasPromoCountdown = false,
  timezone,
  countdownContext,
}: {
  product: Product;
  hasPromoCountdown?: boolean;
  timezone?: string;
  countdownContext?: PromotionCountdownContext | null;
}) {
  const outsideSchedule = useProductOutsideSchedule(product);
  if (outsideSchedule) return <ProductScheduleNote product={product} />;

  return (
    <ProductLowStockSignals
      product={product}
      hasPromoCountdown={hasPromoCountdown}
      timezone={timezone}
      countdownContext={countdownContext}
    />
  );
}
