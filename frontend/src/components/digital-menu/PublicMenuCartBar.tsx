'use client';

import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { formatMoney } from '@/lib/currency';
import styles from './PublicMenuCartBar.module.css';

type PublicMenuCartBarProps = {
  itemCount: number;
  subtotalCents: number;
  currency: string;
  isEstimated?: boolean;
  onOpenCart: () => void;
  isTabletLayout?: boolean;
};

export function PublicMenuCartBar({
  itemCount,
  subtotalCents,
  currency,
  isEstimated = false,
  onOpenCart,
  isTabletLayout = false,
}: PublicMenuCartBarProps) {
  if (itemCount <= 0) return null;

  return (
    <div className={`${styles.cartBar} ${isTabletLayout ? styles.cartBarTablet : ''}`}>
      <button type="button" className={styles.cartBarBtn} onClick={onOpenCart}>
        <span className={styles.cartBarLeft}>
          <ShoppingBagOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
          <span className={styles.countBadge} aria-hidden>
            {itemCount}
          </span>
          <span className={styles.cartBarLabel}>Ver carrito</span>
        </span>
        <span className={styles.cartBarTotal}>
          {formatMoney(subtotalCents / 100, currency)}
          {isEstimated ? <span className={styles.cartBarEstimateHint}> est.</span> : null}
        </span>
      </button>
    </div>
  );
}
