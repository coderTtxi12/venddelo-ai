'use client';

import { useMemo } from 'react';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type {
  RestaurantCustomer,
  RestaurantCustomerActivityItem,
} from '@/lib/api/customers';
import { formatMoney } from '@/lib/currency';
import {
  activityKindLabel,
  activityStatusLabel,
  customerInitials,
  customerWhatsAppHref,
} from '@/lib/customers/display';
import {
  activityStatusBucketLabel,
  channelLabel,
  classifyActivityStatus,
  summarizeCustomerActivity,
} from '@/lib/customers/activitySummary';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { formatOrderDateTime } from '@/lib/orders/orderDisplay';
import styles from './CustomerDetailDrawer.module.css';

function formatCents(cents: number) {
  return formatMoney(cents / 100);
}

function statusToneClass(status: string): string {
  const bucket = classifyActivityStatus(status);
  if (bucket === 'delivered') return styles.statusDelivered;
  if (bucket === 'cancelled') return styles.statusCancelled;
  if (bucket === 'in_progress') return styles.statusProgress;
  return styles.statusOther;
}

function bucketToneClass(bucket: keyof ReturnType<typeof summarizeCustomerActivity>['statusCounts']): string {
  if (bucket === 'delivered') return styles.legendDelivered;
  if (bucket === 'cancelled') return styles.legendCancelled;
  if (bucket === 'in_progress') return styles.legendProgress;
  return styles.legendOther;
}

type CustomerDetailDrawerProps = {
  customer: RestaurantCustomer;
  activity: RestaurantCustomerActivityItem[] | 'loading' | 'error' | null;
  onRetryActivity: () => void;
};

export function CustomerDetailDrawer({
  customer,
  activity,
  onRetryActivity,
}: CustomerDetailDrawerProps) {
  const whatsappHref = customerWhatsAppHref(customer.customer_phone, customer.customer_name);
  const summary = useMemo(
    () => (Array.isArray(activity) ? summarizeCustomerActivity(customer, activity) : null),
    [activity, customer],
  );
  const maxMonthly = Math.max(1, ...(summary?.monthlyActivity.map((bucket) => bucket.count) ?? [1]));
  const totalVisits = summary
    ? summary.menuCount + summary.deliveryCount
    : customer.visit_count;
  const statusTotal = summary
    ? Object.values(summary.statusCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className={styles.detail}>
      <div className={styles.hero}>
        <span className={styles.avatar} aria-hidden>
          {customerInitials(customer.customer_name)}
        </span>
        <div className={styles.heroCopy}>
          <p className={styles.phone}>{formatOrderCustomerPhone(customer.customer_phone)}</p>
          <p className={styles.meta}>
            Cliente desde {formatOrderDateTime(customer.first_order_at)}
          </p>
        </div>
        {whatsappHref ? (
          <a className={styles.whatsapp} href={whatsappHref} target="_blank" rel="noreferrer">
            <WhatsAppIcon fontSize="small" aria-hidden />
            WhatsApp
          </a>
        ) : null}
      </div>

      <section className={styles.spentCard} aria-label="Gasto del cliente">
        <div className={styles.spentMain}>
          <span className={styles.spentLabel}>Gastado</span>
          <strong className={styles.spentValue}>{formatCents(customer.total_spent_cents)}</strong>
        </div>
        <p className={styles.spentHint}>Solo suma pedidos entregados.</p>
      </section>

      {summary ? (
        <>
          <section className={styles.panel} aria-label="Pedidos por canal">
            <h3 className={styles.panelTitle}>Por canal</h3>
            <div className={styles.channelGrid}>
              <div className={styles.channelCard}>
                <span className={`${styles.channelDot} ${styles.channelMenu}`} aria-hidden />
                <div>
                  <span className={styles.channelLabel}>{channelLabel('menu')}</span>
                  <strong className={styles.channelValue}>{summary.menuCount}</strong>
                </div>
              </div>
              <div className={styles.channelCard}>
                <span className={`${styles.channelDot} ${styles.channelDelivery}`} aria-hidden />
                <div>
                  <span className={styles.channelLabel}>{channelLabel('delivery')}</span>
                  <strong className={styles.channelValue}>{summary.deliveryCount}</strong>
                </div>
              </div>
            </div>
            {totalVisits > 0 ? (
              <div
                className={styles.splitBar}
                role="img"
                aria-label={`${summary.menuCount} del menú digital y ${summary.deliveryCount} de delivery manual`}
              >
                <span
                  className={styles.splitMenu}
                  style={{ width: `${(summary.menuCount / totalVisits) * 100}%` }}
                />
                <span
                  className={styles.splitDelivery}
                  style={{ width: `${(summary.deliveryCount / totalVisits) * 100}%` }}
                />
              </div>
            ) : null}
          </section>

          <section className={styles.panel} aria-label="Estado de pedidos">
            <h3 className={styles.panelTitle}>Estado</h3>
            {statusTotal > 0 ? (
              <>
                <div
                  className={styles.statusBar}
                  role="img"
                  aria-label={[
                    `${summary.statusCounts.delivered} entregados`,
                    `${summary.statusCounts.cancelled} cancelados`,
                    `${summary.statusCounts.in_progress} en curso`,
                  ].join(', ')}
                >
                  {(['delivered', 'cancelled', 'in_progress', 'other'] as const).map((bucket) =>
                    summary.statusCounts[bucket] > 0 ? (
                      <span
                        key={bucket}
                        className={bucketToneClass(bucket)}
                        style={{ width: `${(summary.statusCounts[bucket] / statusTotal) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <ul className={styles.legend}>
                  {(['delivered', 'cancelled', 'in_progress'] as const).map((bucket) =>
                    summary.statusCounts[bucket] > 0 ? (
                      <li key={bucket}>
                        <span className={`${styles.legendSwatch} ${bucketToneClass(bucket)}`} aria-hidden />
                        <span>{activityStatusBucketLabel(bucket)}</span>
                        <strong>{summary.statusCounts[bucket]}</strong>
                      </li>
                    ) : null,
                  )}
                </ul>
              </>
            ) : (
              <p className={styles.panelHint}>Sin pedidos registrados.</p>
            )}
          </section>

          <section className={styles.panel} aria-label="Actividad reciente por mes">
            <h3 className={styles.panelTitle}>Actividad (6 meses)</h3>
            <div
              className={styles.monthChart}
              role="img"
              aria-label={summary.monthlyActivity
                .map((bucket) => `${bucket.label}: ${bucket.count}`)
                .join(', ')}
            >
              {summary.monthlyActivity.map((bucket) => (
                <div key={bucket.key} className={styles.monthCol}>
                  <div className={styles.monthBarTrack}>
                    <span
                      className={styles.monthBarFill}
                      style={{ height: `${(bucket.count / maxMonthly) * 100}%` }}
                    />
                  </div>
                  <span className={styles.monthCount}>{bucket.count || '·'}</span>
                  <span className={styles.monthLabel}>{bucket.label}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className={styles.history}>
        <h3 className={styles.historyTitle}>Historial</h3>
        {activity === 'loading' || activity == null ? (
          <p className={styles.hint}>Cargando pedidos…</p>
        ) : activity === 'error' ? (
          <div className={styles.errorRow}>
            <p>No se pudo cargar el historial.</p>
            <button type="button" className={styles.retryButton} onClick={onRetryActivity}>
              Reintentar
            </button>
          </div>
        ) : activity.length === 0 ? (
          <p className={styles.hint}>Este cliente no tiene pedidos recientes.</p>
        ) : (
          <ul className={styles.activityList}>
            {activity.map((item) => (
              <li key={`${item.kind}-${item.id}`} className={styles.activityItem}>
                <div className={styles.activityTop}>
                  <span className={styles.activityId}>#{item.display_id}</span>
                  <span className={styles.activityKind}>
                    {activityKindLabel(item.kind, item.order_type)}
                  </span>
                  <span className={`${styles.statusBadge} ${statusToneClass(item.status)}`}>
                    {activityStatusLabel(item.kind, item.status)}
                  </span>
                </div>
                <div className={styles.activityBottom}>
                  <span className={styles.activityWhen}>{formatOrderDateTime(item.created_at)}</span>
                  <span
                    className={`${styles.activityAmount} ${
                      item.status !== 'delivered' ? styles.activityAmountMuted : ''
                    }`}
                    title={
                      item.status !== 'delivered'
                        ? 'Solo los entregados suman al gasto'
                        : undefined
                    }
                  >
                    {formatCents(item.total_cents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
