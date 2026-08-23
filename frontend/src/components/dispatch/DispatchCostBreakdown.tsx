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

export function customerTotalCents(restaurantCents: number, deliveryCents: number): number {
  return Math.max(0, restaurantCents) + Math.max(0, deliveryCents);
}

export function DispatchCostBreakdown({
  restaurantCents,
  deliveryCents,
  paymentMethod = 'cash',
  hint,
  weatherNotice,
}: DispatchCostBreakdownProps) {
  const restaurantPaid = paymentMethod === 'transfer' || restaurantCents <= 0;
  const totalCents = customerTotalCents(restaurantCents, deliveryCents);

  return (
    <div className={styles.card} role="status">
      <p className={styles.title}>Desglose de costos</p>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>
            <DeliveryDiningOutlinedIcon className={styles.icon} aria-hidden />
            Envío
          </dt>
          <dd>{pesos(deliveryCents)}</dd>
        </div>
        <div className={styles.row}>
          <dt>
            <StorefrontOutlinedIcon className={styles.icon} aria-hidden />
            Tu negocio recibe
          </dt>
          <dd>{restaurantPaid ? 'Sin cobro' : pesos(restaurantCents)}</dd>
        </div>
        {paymentMethod !== 'transfer' ? (
          <div className={`${styles.row} ${styles.total}`}>
            <dt>Total a cobrar</dt>
            <dd>{pesos(totalCents)}</dd>
          </div>
        ) : null}
      </dl>
      {paymentMethod !== 'transfer' ? (
        <p className={styles.hint}>El total incluye el envío.</p>
      ) : null}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {weatherNotice}
    </div>
  );
}
