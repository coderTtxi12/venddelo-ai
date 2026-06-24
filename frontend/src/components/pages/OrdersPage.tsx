'use client';

import { KitchenOrdersView } from '@/components/orders/KitchenOrdersView';
import styles from './OrdersPage.module.css';

export default function OrdersPage() {
  return (
    <div className={styles.page}>
      <KitchenOrdersView />
    </div>
  );
}
