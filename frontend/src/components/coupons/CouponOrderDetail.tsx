'use client';

import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { Order } from '@/lib/api/types';
import { customerInitials, customerWhatsAppHref } from '@/lib/customers/display';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import {
  buildOrderTotalsBreakdown,
  countOrderItems,
  formatCents,
  formatOrderDateTime,
  formatOrderDisplayId,
  formatOrderShortId,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
  splitOrderNote,
} from '@/lib/orders/orderDisplay';
import { ORDER_STATUS_META } from '@/lib/orders/orderStatus';
import styles from './CouponOrderDetail.module.css';

type CouponOrderDetailProps = {
  order: Order | null;
  loading?: boolean;
  error?: string | null;
  customerName?: string;
  couponCode?: string | null;
};

function statusPillClass(status: Order['status']): string {
  const tone = ORDER_STATUS_META[status]?.tone;
  if (tone === 'pending') return styles.statusPending;
  if (tone === 'delivered') return styles.statusDelivered;
  if (tone === 'cancelled') return styles.statusCancelled;
  if (tone === 'confirmed' || tone === 'preparing' || tone === 'ready') {
    return styles.statusConfirmed;
  }
  return styles.statusDefault;
}

export function CouponOrderDetail({
  order,
  loading,
  error,
  customerName,
  couponCode,
}: CouponOrderDetailProps) {
  if (loading) {
    return (
      <div className={styles.loadingState} aria-busy="true">
        <p className={styles.loadingTitle}>Cargando pedido…</p>
        <p>Un momento, estamos trayendo los detalles.</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className={styles.errorState} role="alert">
        <p className={styles.errorTitle}>No se pudo cargar el pedido</p>
        <p>{error ?? 'Pedido no disponible.'}</p>
      </div>
    );
  }

  const itemCount = countOrderItems(order.items);
  const noteParts = splitOrderNote(order.note);
  const totals = buildOrderTotalsBreakdown(order);
  const whatsAppHref = customerWhatsAppHref(order.customer_phone, order.customer_name, {
    couponCode: couponCode ?? order.applied_coupon_code,
    orderShortId: formatOrderShortId(order.id),
  });
  const statusLabel = ORDER_STATUS_META[order.status]?.label ?? order.status;
  const displayName = customerName ?? order.customer_name;

  return (
    <div className={styles.detail}>
      <section className={styles.section} aria-label="Cliente">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Cliente</h4>
          <p className={styles.sectionHint}>Datos de contacto de quien usó el cupón.</p>
        </div>
        <div className={styles.customerRow}>
          <span className={styles.avatar} aria-hidden>
            {customerInitials(displayName)}
          </span>
          <div className={styles.customerCopy}>
            <p className={styles.customerName}>{displayName}</p>
            <p className={styles.customerPhone}>
              {formatOrderCustomerPhone(order.customer_phone)}
            </p>
          </div>
        </div>
        {whatsAppHref ? (
          <a
            href={whatsAppHref}
            className={styles.whatsApp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp a ${displayName}`}
          >
            <WhatsAppIcon sx={{ fontSize: 18 }} />
            Escribir por WhatsApp
          </a>
        ) : null}
      </section>

      <section className={styles.section} aria-label="Detalles del pedido">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Detalles del pedido</h4>
        </div>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Estado</span>
            <span className={`${styles.statusPill} ${statusPillClass(order.status)}`}>
              {statusLabel}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Servicio</span>
            <span className={styles.metaValue}>{formatOrderTypeLabel(order.type)}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Pago</span>
            <span className={styles.metaValue}>
              {formatOrderPaymentLabel(order.payment_method)}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Fecha</span>
            <span className={styles.metaValue}>{formatOrderDateTime(order.created_at)}</span>
          </div>
          {order.type === 'delivery' && order.delivery_address ? (
            <div className={`${styles.metaItem} ${styles.metaItemWide}`}>
              <span className={styles.metaLabel}>Dirección</span>
              <span className={styles.metaValue}>{order.delivery_address}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.section} aria-label="Artículos del pedido">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>
            Artículos ({itemCount === 1 ? '1' : itemCount})
          </h4>
        </div>
        <div className={styles.items}>
          {order.items.map((item) => (
            <div key={item.id} className={styles.itemRow}>
              <p className={styles.itemName}>
                <span className={styles.itemQty}>{item.quantity}×</span> {item.product_name}
              </p>
              <span className={styles.itemPrice}>{formatCents(item.line_total_cents)}</span>
            </div>
          ))}
        </div>
      </section>

      {noteParts.details ? (
        <section className={styles.section} aria-label="Notas del pedido">
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Notas</h4>
          </div>
          <p className={styles.noteText}>{noteParts.details}</p>
        </section>
      ) : null}

      <section className={styles.section} aria-label="Totales del pedido">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Resumen de pago</h4>
        </div>
        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatCents(totals.subtotalBeforeCents)}</span>
          </div>
          {totals.lineDiscountCents > 0 ? (
            <div className={`${styles.totalRow} ${styles.totalRowDiscount}`}>
              <span>Descuentos</span>
              <span>−{formatCents(totals.lineDiscountCents)}</span>
            </div>
          ) : null}
          {totals.promoOrderDiscountCents > 0 ? (
            <div className={`${styles.totalRow} ${styles.totalRowDiscount}`}>
              <span>Promoción</span>
              <span>−{formatCents(totals.promoOrderDiscountCents)}</span>
            </div>
          ) : null}
          {totals.appliedCouponCode ? (
            <div className={`${styles.totalRow} ${styles.totalRowDiscount}`}>
              <span>Cupón {totals.appliedCouponCode}</span>
              <span>
                {totals.couponWaivedDeliveryCents > 0
                  ? 'Envío gratis'
                  : totals.couponDiscountCents > 0
                    ? `−${formatCents(totals.couponDiscountCents)}`
                    : '—'}
              </span>
            </div>
          ) : null}
          {totals.deliveryFeeCents > 0 ? (
            <div className={styles.totalRow}>
              <span>Envío</span>
              <span>{formatCents(totals.deliveryFeeCents)}</span>
            </div>
          ) : null}
          <div className={`${styles.totalRow} ${styles.totalRowStrong}`}>
            <span>Total · #{formatOrderDisplayId(order)}</span>
            <span>{formatCents(totals.totalCents)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
