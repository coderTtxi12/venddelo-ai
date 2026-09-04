'use client';

import { useEffect, useMemo, useState } from 'react';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { getProduct } from '@/lib/api/menu';
import type { Order, OrderItem, Product } from '@/lib/api/types';
import {
  resolveOrderDeliveryMapsUrl,
  resolveOrderDeliveryPinUrl,
} from '@/lib/customers/activityChart';
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
  orderItemPreDiscountCents,
  resolveOrderItemBaseUnitCents,
  resolveOrderItemDiscounts,
  resolveOrderItemOptions,
  splitOrderNote,
} from '@/lib/orders/orderDisplay';
import { ORDER_STATUS_META } from '@/lib/orders/orderStatus';
import { productIdsNeededForTicketOptions } from '@/lib/print/ticketDocument';
import { useKitchenTicketPrinter } from '@/lib/print/useKitchenTicketPrinter';
import styles from './CouponOrderDetail.module.css';

type CouponOrderDetailProps = {
  order: Order | null;
  loading?: boolean;
  error?: string | null;
  customerName?: string;
  couponCode?: string | null;
  /** Override the client section hint. Pass `null` to hide it. */
  customerSectionHint?: string | null;
  accessToken?: string | null;
  restaurantId?: string | null;
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

function formatOptionDelta(cents: number): string {
  if (cents <= 0) return 'Incluido';
  return `+${formatCents(cents)}`;
}

function OrderDetailItem({
  item,
  productsById,
  productsLoading,
}: {
  item: OrderItem;
  productsById: ReadonlyMap<string, Product>;
  productsLoading: boolean;
}) {
  const options = resolveOrderItemOptions(item, productsById);
  const hasSelectedOptions =
    item.selected_options != null && Object.keys(item.selected_options).length > 0;
  const optionsPending =
    productsLoading && item.product_id != null && !productsById.has(item.product_id);
  const discounts = resolveOrderItemDiscounts(item, {
    product: item.product_id ? productsById.get(item.product_id) : undefined,
    promotions: [],
  });
  const linePreDiscount = orderItemPreDiscountCents(item, discounts);
  const baseUnitCents = resolveOrderItemBaseUnitCents(item, productsById, options);

  return (
    <div className={styles.itemCard}>
      <div className={styles.itemRow}>
        <p className={styles.itemName}>
          <span className={styles.itemQty}>{item.quantity}×</span> {item.product_name}
        </p>
        <span className={styles.itemPrice}>{formatCents(linePreDiscount)}</span>
      </div>

      <div className={styles.itemBreakdown}>
        <div className={styles.itemBreakdownRow}>
          <span>Precio base</span>
          <span>{formatCents(baseUnitCents)}</span>
        </div>

        {optionsPending ? (
          <p className={styles.itemOptionsLoading}>Cargando complementos…</p>
        ) : options.length > 0 ? (
          options.map((group) =>
            group.choices.map((choice) => (
              <div
                key={`${item.id}-${group.groupId}-${choice.id}`}
                className={styles.itemBreakdownRow}
              >
                <span>
                  <span className={styles.itemOptionGroup}>{group.groupTitle}: </span>
                  {choice.label}
                </span>
                <span className={choice.priceDeltaCents > 0 ? styles.itemOptionPaid : undefined}>
                  {formatOptionDelta(choice.priceDeltaCents)}
                </span>
              </div>
            )),
          )
        ) : hasSelectedOptions ? (
          <p className={styles.itemOptionsLoading}>Complementos no disponibles</p>
        ) : null}

        {discounts.map((discount) => (
          <div
            key={`${item.id}-${discount.label}-${discount.discount_cents}`}
            className={`${styles.itemBreakdownRow} ${styles.itemDiscountRow}`}
          >
            <span>
              {discount.label}
              {discount.badge ? ` · ${discount.badge}` : ''}
            </span>
            <span>
              {discount.discount_cents > 0 ? `−${formatCents(discount.discount_cents)}` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CouponOrderDetail({
  order,
  loading,
  error,
  customerName,
  couponCode,
  customerSectionHint = 'Datos de contacto de quien usó el cupón.',
  accessToken = null,
  restaurantId = null,
}: CouponOrderDetailProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [printState, setPrintState] = useState<'idle' | 'printing' | 'done' | 'error'>('idle');
  const [printError, setPrintError] = useState<string | null>(null);
  const [productsById, setProductsById] = useState<Map<string, Product>>(() => new Map());
  const [productsLoading, setProductsLoading] = useState(false);
  const { printOrder } = useKitchenTicketPrinter(accessToken, restaurantId);

  const productIdsKey = useMemo(() => {
    if (!order) return '';
    return order.items
      .map((item) => item.product_id)
      .filter((id): id is string => Boolean(id))
      .sort()
      .join(',');
  }, [order]);

  useEffect(() => {
    if (!order || !accessToken || !restaurantId) {
      setProductsById(new Map());
      setProductsLoading(false);
      return;
    }
    let cancelled = false;
    const missing = productIdsNeededForTicketOptions(order, new Map());
    // Also load products that appear on the order even without options, for base price.
    const allIds = [
      ...new Set(
        order.items
          .map((item) => item.product_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const toLoad = allIds.length > 0 ? allIds : missing;
    if (toLoad.length === 0) {
      setProductsById(new Map());
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);
    void Promise.all(
      toLoad.map(async (productId) => {
        try {
          return await getProduct(accessToken, restaurantId, productId);
        } catch {
          return null;
        }
      }),
    ).then((loaded) => {
      if (cancelled) return;
      const next = new Map<string, Product>();
      for (const product of loaded) {
        if (product) next.set(product.id, product);
      }
      setProductsById(next);
      setProductsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, order, productIdsKey, restaurantId]);

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
    couponCode: couponCode ?? order.applied_coupon_code ?? undefined,
    orderShortId: formatOrderShortId(order.id),
  });
  const statusLabel = ORDER_STATUS_META[order.status]?.label ?? order.status;
  const displayName = customerName ?? order.customer_name;
  const pinUrl = resolveOrderDeliveryPinUrl(order);
  const mapsUrl = resolveOrderDeliveryMapsUrl(order);
  const showAddress = order.type === 'delivery' && Boolean(order.delivery_address?.trim());
  const canPrint = Boolean(accessToken && restaurantId);
  const printableOrder = order;

  async function copyMapsPin() {
    if (!pinUrl) return;
    try {
      await navigator.clipboard.writeText(pinUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  async function handlePrint() {
    if (!canPrint || printState === 'printing') return;
    setPrintState('printing');
    setPrintError(null);
    try {
      const result = await printOrder(printableOrder, 'manual', productsById);
      if (result.status === 'failed') {
        setPrintState('error');
        setPrintError(result.error ?? 'No se pudo imprimir el ticket.');
        window.setTimeout(() => setPrintState('idle'), 2800);
        return;
      }
      if (result.status === 'skipped') {
        setPrintState('error');
        setPrintError('Configura la impresora en Ajustes → Impresora.');
        window.setTimeout(() => setPrintState('idle'), 2800);
        return;
      }
      setPrintState('done');
      window.setTimeout(() => setPrintState('idle'), 1800);
    } catch (printErr) {
      setPrintState('error');
      setPrintError(
        printErr instanceof Error ? printErr.message : 'No se pudo imprimir el ticket.',
      );
      window.setTimeout(() => setPrintState('idle'), 2800);
    }
  }

  return (
    <div className={styles.detail}>
      <section className={styles.section} aria-label="Cliente">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Cliente</h4>
          {customerSectionHint ? (
            <p className={styles.sectionHint}>{customerSectionHint}</p>
          ) : null}
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
        </div>
        {showAddress ? (
          <div className={styles.addressCard} aria-label="Dirección de entrega">
            <div className={styles.addressHeader}>
              <span className={styles.addressTitle}>Dirección</span>
              <div className={styles.addressActions}>
                <button
                  type="button"
                  className={styles.addressActionBtn}
                  onClick={() => void copyMapsPin()}
                  disabled={!pinUrl}
                  aria-label="Copiar enlace de Google Maps"
                  title={
                    pinUrl
                      ? 'Copia el pin exacto (lat, long) de la entrega'
                      : 'Sin coordenadas para generar enlace'
                  }
                >
                  <ContentCopyOutlinedIcon fontSize="inherit" aria-hidden />
                  <span className={styles.addressActionLabel}>
                    {copyState === 'copied'
                      ? 'Link copiado'
                      : copyState === 'error'
                        ? 'Error'
                        : 'Copiar'}
                  </span>
                </button>
                {mapsUrl ? (
                  <a
                    className={styles.addressActionBtn}
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Abrir ubicación en Google Maps"
                  >
                    <MapOutlinedIcon fontSize="inherit" aria-hidden />
                    <span className={styles.addressActionLabel}>Maps</span>
                  </a>
                ) : null}
              </div>
            </div>
            <p className={styles.addressText}>{order.delivery_address}</p>
          </div>
        ) : null}
        {order.cancellation_reason ? (
          <div className={styles.cancelReason}>
            <span className={styles.cancelLabel}>Motivo de cancelación</span>
            <p className={styles.cancelText}>{order.cancellation_reason}</p>
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-label="Artículos del pedido">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>
            Artículos ({itemCount === 1 ? '1' : itemCount})
          </h4>
        </div>
        <div className={styles.items}>
          {order.items.map((item) => (
            <OrderDetailItem
              key={item.id}
              item={item}
              productsById={productsById}
              productsLoading={productsLoading}
            />
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

      {canPrint ? (
        <div className={styles.printBar}>
          <button
            type="button"
            className={styles.printButton}
            onClick={() => void handlePrint()}
            disabled={printState === 'printing'}
          >
            <PrintOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {printState === 'printing'
              ? 'Imprimiendo…'
              : printState === 'done'
                ? 'Ticket enviado'
                : printState === 'error'
                  ? 'Reintentar impresión'
                  : 'Imprimir ticket'}
          </button>
          {printError ? <p className={styles.printError}>{printError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
