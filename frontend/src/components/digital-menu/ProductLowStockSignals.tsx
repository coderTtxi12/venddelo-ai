'use client';

import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import type { Product } from '@/lib/api/types';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { useRestaurantClosingCountdown } from '@/hooks/useRestaurantClosingCountdown';
import {
  ProductLowStockBadge,
  shouldShowProductLowStock,
} from '@/components/digital-menu/menuProductLowStock';
import styles from '../pages/DigitalMenuPage.module.css';

type ProductLowStockSignalsProps = {
  product: Product;
  /** When true, promo countdown already covers scarcity timing — skip closing timer. */
  hasPromoCountdown?: boolean;
  timezone?: string;
  countdownContext?: PromotionCountdownContext | null;
  className?: string;
};

export function ProductLowStockSignals({
  product,
  hasPromoCountdown = false,
  timezone,
  countdownContext,
  className,
}: ProductLowStockSignalsProps) {
  const showLowStock = shouldShowProductLowStock(product);
  const closing = useRestaurantClosingCountdown(
    showLowStock && !hasPromoCountdown ? timezone : undefined,
    showLowStock && !hasPromoCountdown ? countdownContext : null,
  );

  if (!showLowStock) return null;

  const showClosing = closing != null && !closing.isExpired;
  const isUrgent = showClosing && closing.remainingMs <= 3_600_000;

  return (
    <div
      className={[styles.productLowStockRow, className].filter(Boolean).join(' ')}
      role="status"
      aria-atomic="true"
    >
      <ProductLowStockBadge />
      {showClosing ? (
        <span
          className={[
            styles.productLowStockClosing,
            isUrgent ? styles.productLowStockClosingUrgent : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="timer"
          aria-label={`${closing.label} ${closing.display}`}
        >
          <AccessTimeOutlinedIcon sx={{ fontSize: 12 }} aria-hidden />
          <span className={styles.productLowStockClosingDigits}>{closing.display}</span>
        </span>
      ) : null}
    </div>
  );
}
