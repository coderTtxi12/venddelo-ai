'use client';

import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { Order } from '@/lib/api/types';
import { customerWhatsAppHref } from '@/lib/customers/display';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import {
  countOrderItems,
  formatCents,
  formatOrderDateTime,
  formatOrderDisplayId,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
} from '@/lib/orders/orderDisplay';
import styles from './OrderHistoryDetailDrawer.module.css';

function statusLabel(status: Order['status']): string {
  if (status === 'delivered') return 'Entregado';
  if (status === 'cancelled') return 'Cancelado';
  return status;
}

export function OrderHistoryDetailDrawer({ order }: { order: Order }) {
  const displayId = formatOrderDisplayId(order);
  const whatsappHref = customerWhatsAppHref(order.customer_phone, order.customer_name, {
    orderShortId: displayId,
  });
  const itemCount = countOrderItems(order.items);

  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <p className={styles.orderId}>#{displayId}</p>
        <p
          className={`${styles.statusBadge} ${
            order.status === 'delivered' ? styles.statusDelivered : styles.statusCancelled
          }`}
        >
          {statusLabel(order.status)}
        </p>
        <p className={styles.total}>{formatCents(order.total_cents)}</p>
        <p className={styles.meta}>
          {formatOrderDateTime(order.created_at)} ·{' '}
          {itemCount === 1 ? '1 artículo' : `${itemCount} artículos`}
        </p>
      </section>

      <section className={styles.section} aria-labelledby="history-customer-heading">
        <h3 id="history-customer-heading" className={styles.sectionTitle}>
          Cliente
        </h3>
        <p className={styles.primary}>{order.customer_name || 'Sin nombre'}</p>
        <p className={styles.secondary}>{formatOrderCustomerPhone(order.customer_phone)}</p>
        {whatsappHref ? (
          <a
            className={styles.whatsappBtn}
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppIcon fontSize="small" aria-hidden />
            Abrir WhatsApp
          </a>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="history-fulfillment-heading">
        <h3 id="history-fulfillment-heading" className={styles.sectionTitle}>
          Pedido
        </h3>
        <dl className={styles.dl}>
          <div className={styles.dlRow}>
            <dt>Tipo</dt>
            <dd>{formatOrderTypeLabel(order.type)}</dd>
          </div>
          <div className={styles.dlRow}>
            <dt>Pago</dt>
            <dd>{formatOrderPaymentLabel(order.payment_method)}</dd>
          </div>
          {order.delivery_address ? (
            <div className={styles.dlRow}>
              <dt>Dirección</dt>
              <dd>{order.delivery_address}</dd>
            </div>
          ) : null}
        </dl>
        {order.cancellation_reason ? (
          <p className={styles.cancelReason}>
            <span className={styles.cancelLabel}>Motivo de cancelación</span>
            {order.cancellation_reason}
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="history-items-heading">
        <h3 id="history-items-heading" className={styles.sectionTitle}>
          Artículos
        </h3>
        <ul className={styles.itemList}>
          {order.items.map((item) => (
            <li key={item.id} className={styles.itemRow}>
              <span className={styles.itemQty}>{item.quantity}×</span>
              <span className={styles.itemName}>{item.product_name}</span>
              <span className={styles.itemPrice}>{formatCents(item.line_total_cents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
