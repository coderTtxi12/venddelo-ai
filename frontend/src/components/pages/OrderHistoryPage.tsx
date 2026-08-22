import OrderHistoryView from '@/components/orders/OrderHistoryView';
import styles from './OrdersPage.module.css';

export default function OrderHistoryPage() {
  return (
    <div className={styles.page}>
      <OrderHistoryView />
    </div>
  );
}
