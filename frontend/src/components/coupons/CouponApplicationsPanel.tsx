'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { CouponApplication, Order } from '@/lib/api/types';
import { listCouponApplications } from '@/lib/api/coupons';
import { getRestaurantOrder } from '@/lib/api/orders';
import { activityStatusLabel, customerInitials, customerWhatsAppHref } from '@/lib/customers/display';
import { formatMoney } from '@/lib/currency';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { formatOrderShortId } from '@/lib/orders/orderDisplay';
import { ORDER_STATUS_META } from '@/lib/orders/orderStatus';
import { summarizeConfirmedCouponApplications, isConfirmedCouponApplication } from '@/lib/coupons/applications';
import { CouponOrderDetail } from '@/components/coupons/CouponOrderDetail';
import styles from './CouponApplicationsPanel.module.css';

type CouponApplicationsPanelProps = {
  accessToken: string;
  restaurantId: string;
  couponId: string;
  couponCode: string;
  /** Oculta el título cuando el drawer padre ya lo muestra. */
  hideTitle?: boolean;
};

function formatAppliedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusPillClass(status: CouponApplication['status']): string {
  const tone = ORDER_STATUS_META[status as keyof typeof ORDER_STATUS_META]?.tone;
  if (tone === 'pending') return styles.statusPending;
  if (tone === 'delivered') return styles.statusDelivered;
  if (tone === 'cancelled') return styles.statusCancelled;
  if (tone === 'confirmed' || tone === 'preparing' || tone === 'ready') {
    return styles.statusConfirmed;
  }
  return styles.statusDefault;
}

export function CouponApplicationsPanel({
  accessToken,
  restaurantId,
  couponId,
  couponCode,
  hideTitle = false,
}: CouponApplicationsPanelProps) {
  const [applications, setApplications] = useState<CouponApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (cursor?: string | null, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await listCouponApplications(
          accessToken,
          restaurantId,
          couponId,
          undefined,
          cursor,
        );
        setApplications((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.next_cursor);
        setHasMore(page.has_more);
      } catch (loadError) {
        console.error(loadError);
        setError('No se pudo cargar la lista de clientes.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accessToken, couponId, restaurantId],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setSelectedOrder(null);

    void getRestaurantOrder(accessToken, restaurantId, selectedOrderId)
      .then((order) => {
        if (!cancelled) setSelectedOrder(order);
      })
      .catch((loadError) => {
        console.error(loadError);
        if (!cancelled) setDetailError('No se pudo cargar el detalle del pedido.');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, restaurantId, selectedOrderId]);

  const selectedApplication = applications.find((item) => item.order_id === selectedOrderId);

  const summary = useMemo(
    () => summarizeConfirmedCouponApplications(applications),
    [applications],
  );

  if (selectedOrderId) {
    const orderCode = selectedOrder
      ? formatOrderShortId(selectedOrder.id)
      : formatOrderShortId(selectedOrderId);

    return (
      <div className={styles.shell} aria-label="Detalle del pedido con cupón">
        <div className={styles.scroll}>
          <div className={styles.stack}>
            <div className={styles.detailNav}>
              <button
                type="button"
                className={styles.backBtn}
                aria-label="Volver a la lista de usos"
                onClick={() => setSelectedOrderId(null)}
              >
                <ArrowBackOutlinedIcon sx={{ fontSize: 18 }} />
              </button>
              <div className={styles.detailHeading}>
                <h3 className={styles.detailTitle}>Pedido #{orderCode}</h3>
                <p className={styles.detailSub}>
                  {selectedApplication
                    ? `${selectedApplication.customer_name} · ${formatAppliedAt(selectedApplication.created_at)}`
                    : 'Detalle del pedido'}
                </p>
              </div>
            </div>
            <CouponOrderDetail
              order={selectedOrder}
              loading={detailLoading}
              error={detailError}
              customerName={selectedApplication?.customer_name}
              couponCode={couponCode}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.shell}
      aria-labelledby={hideTitle ? undefined : 'coupon-applications-title'}
    >
      <div className={styles.scroll}>
        <div className={styles.stack}>
          {hideTitle ? null : (
            <div className={styles.header}>
              <h3 id="coupon-applications-title" className={styles.title}>
                Clientes que usaron este cupón
              </h3>
              <p className={styles.hint}>
                Pedidos donde se aplicó <strong>{couponCode}</strong>. Toca un cliente para ver el
                pedido completo.
              </p>
            </div>
          )}

          {hideTitle ? (
            <p className={styles.hint}>Toca un cliente para ver el pedido completo.</p>
          ) : null}

          {loading ? (
            <div className={styles.loadingCard} aria-busy="true" aria-label="Cargando usos del cupón">
              <div className={styles.loadingLine} />
              <div className={styles.loadingLine} />
              <div className={styles.loadingLine} />
            </div>
          ) : null}

          {error ? (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          ) : null}

          {!loading && !error && applications.length > 0 ? (
            <div className={styles.summaryBlock}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryMetric}>
                  <span className={styles.summaryLabel}>Usos confirmados</span>
                  <span className={styles.summaryValue}>
                    {summary.uses}
                    {hasMore ? '+' : ''}
                  </span>
                </div>
                <div className={styles.summaryMetric}>
                  <span className={styles.summaryLabel}>Descuento confirmado</span>
                  <span className={`${styles.summaryValue} ${styles.summaryValueDiscount}`}>
                    −{formatMoney(summary.totalDiscountCents / 100)}
                  </span>
                </div>
              </div>
              <p className={styles.summaryHint}>
                Solo pedidos que ya aceptaste en cocina. Los pendientes aparecen abajo pero no
                cuentan aquí.
              </p>
            </div>
          ) : null}

          {!loading && !error && applications.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Aún nadie ha usado este cupón</p>
              <p>Cuando un cliente lo aplique al pagar, aparecerá aquí con su nombre y pedido.</p>
            </div>
          ) : null}

          {!loading && !error && applications.length > 0 ? (
            <>
              <ul className={styles.list} aria-label="Clientes con cupón aplicado">
                {applications.map((application) => {
                  const orderCode = formatOrderShortId(application.order_id);
                  const whatsAppHref = customerWhatsAppHref(
                    application.customer_phone,
                    application.customer_name,
                    { couponCode, orderShortId: orderCode },
                  );
                  const statusLabel = activityStatusLabel('menu', application.status);
                  const confirmed = isConfirmedCouponApplication(application);

                  return (
                    <li key={application.order_id}>
                      <button
                        type="button"
                        className={styles.card}
                        aria-label={`Ver pedido ${orderCode} de ${application.customer_name}`}
                        onClick={() => setSelectedOrderId(application.order_id)}
                      >
                        <div className={styles.cardBody}>
                          <span className={styles.avatar} aria-hidden>
                            {customerInitials(application.customer_name)}
                          </span>
                          <div className={styles.cardMain}>
                            <div className={styles.cardTop}>
                              <span className={styles.orderCode}>#{orderCode}</span>
                              <span
                                className={`${styles.statusPill} ${statusPillClass(application.status)}`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <p className={styles.customerName}>{application.customer_name}</p>
                            <p className={styles.cardMeta}>
                              {formatOrderCustomerPhone(application.customer_phone)} ·{' '}
                              {formatAppliedAt(application.created_at)}
                            </p>
                          </div>
                          <div className={styles.cardAmounts} aria-label="Montos del pedido">
                            <span
                              className={`${styles.discount} ${
                                confirmed ? '' : styles.discountPending
                              }`}
                            >
                              −{formatMoney(application.coupon_discount_cents / 100)}
                            </span>
                            <span className={styles.total}>
                              {formatMoney(application.total_cents / 100)}
                            </span>
                            {!confirmed ? (
                              <span className={styles.pendingHint}>Por confirmar</span>
                            ) : null}
                          </div>
                        </div>
                        <div className={styles.cardFooter}>
                          {whatsAppHref ? (
                            <a
                              href={whatsAppHref}
                              className={styles.whatsApp}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`WhatsApp a ${application.customer_name}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <WhatsAppIcon sx={{ fontSize: 16 }} />
                              WhatsApp
                            </a>
                          ) : (
                            <span />
                          )}
                          <span className={styles.viewHint}>
                            Ver pedido
                            <ChevronRightOutlinedIcon sx={{ fontSize: 18 }} />
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  className={styles.loadMore}
                  disabled={loadingMore}
                  onClick={() => void loadPage(nextCursor, true)}
                >
                  {loadingMore ? 'Cargando…' : 'Cargar más usos'}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
