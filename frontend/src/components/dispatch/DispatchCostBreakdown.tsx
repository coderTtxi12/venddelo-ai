'use client';

import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/currency';
import styles from './DispatchCostBreakdown.module.css';

type DispatchCostBreakdownProps = {
  restaurantCents: number;
  deliveryCents: number;
  paymentMethod?: 'cash' | 'transfer' | 'card_terminal';
  hint?: string | null;
  weatherNotice?: ReactNode;
};

function pesos(cents: number): string {
  return formatMoney(cents / 100, 'MXN');
}

export function DispatchCostBreakdown({
  restaurantCents,
  deliveryCents,
  paymentMethod = 'cash',
  hint,
  weatherNotice,
}: DispatchCostBreakdownProps) {
  const restaurantPaid = paymentMethod === 'transfer' || restaurantCents <= 0;
  const totalCents = Math.max(0, restaurantCents) + Math.max(0, deliveryCents);

  return (
    <div className={styles.card} role="status">
      <p className={styles.title}>Desglose de costos</p>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>
            <StorefrontOutlinedIcon className={styles.icon} aria-hidden />
            Restaurante
          </dt>
          <dd>{restaurantPaid ? 'Sin cobro' : pesos(restaurantCents)}</dd>
        </div>
        <div className={styles.row}>
          <dt>
            <DeliveryDiningOutlinedIcon className={styles.icon} aria-hidden />
            Envío
          </dt>
          <dd>{pesos(deliveryCents)}</dd>
        </div>
        <div className={`${styles.row} ${styles.total}`}>
          <dt>Suma</dt>
          <dd>{pesos(totalCents)}</dd>
        </div>
      </dl>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {weatherNotice}
    </div>
  );
}
