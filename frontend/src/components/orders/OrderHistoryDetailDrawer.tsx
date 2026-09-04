'use client';

import { CouponOrderDetail } from '@/components/coupons/CouponOrderDetail';
import type { Order } from '@/lib/api/types';
import { formatOrderDateTime, formatOrderDisplayId } from '@/lib/orders/orderDisplay';
import styles from './OrderHistoryDetailDrawer.module.css';

export function OrderHistoryDetailDrawer({
  order,
  accessToken,
  restaurantId,
}: {
  order: Order;
  accessToken: string;
  restaurantId: string;
}) {
  const displayId = formatOrderDisplayId(order);

  return (
    <div className={styles.root}>
      <header className={styles.heading}>
        <h3 className={styles.title}>Pedido #{displayId}</h3>
        <p className={styles.sub}>
          {order.customer_name || 'Sin nombre'} · {formatOrderDateTime(order.created_at)}
        </p>
      </header>
      <CouponOrderDetail
        order={order}
        customerName={order.customer_name}
        customerSectionHint="Datos de contacto del cliente."
        accessToken={accessToken}
        restaurantId={restaurantId}
      />
    </div>
  );
}
