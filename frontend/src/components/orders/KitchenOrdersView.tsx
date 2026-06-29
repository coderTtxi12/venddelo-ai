'use client';

import { useEffect, useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { listProducts } from '@/lib/api/menu';
import { listAllPromotions } from '@/lib/api/promotions';
import { updateRestaurantOrderStatus } from '@/lib/api/orders';
import { fetchAllPages } from '@/lib/api/pagination';
import type { Order, OrderItem, OrderStatus, Product, Promotion } from '@/lib/api/types';
import {
  countOrderItems,
  extractOrderRefFromNote,
  formatCents,
  formatOrderClock,
  formatOrderDateTime,
  formatOrderDisplayId,
  formatOrderElapsed,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
  resolveOrderItemOptions,
  resolveOrderItemDiscounts,
  orderItemPreDiscountCents,
  buildOrderTotalsBreakdown,
  splitOrderNote,
} from '@/lib/orders/orderDisplay';
import { collectOrderDiscountRows } from '@/lib/orders/orderItemDiscounts';
import {
  canCancelOrder,
  DEFAULT_KITCHEN_STATUS_FILTER,
  buildOrderStatusFilterCounts,
  matchesOrderStatusFilter,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_META,
  type OrderStatusFilter,
  type OrderStatusMeta,
} from '@/lib/orders/orderStatus';
import { OrderCancelDialog } from '@/components/orders/OrderCancelDialog';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import {
  buildOrderAcceptedWhatsAppMessage,
  buildOrderCancelledWhatsAppMessage,
  buildOrderGoogleMapsUrl,
  openCustomerWhatsAppMessage,
  type KitchenCancelReason,
} from '@/lib/orders/kitchenWhatsApp';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import styles from './OrdersKitchen.module.css';

function statusClassName(tone: OrderStatusMeta['tone']): string {
  switch (tone) {
    case 'pending':
      return styles.statusPending;
    case 'confirmed':
      return styles.statusConfirmed;
    case 'preparing':
      return styles.statusPreparing;
    case 'ready':
      return styles.statusReady;
    case 'delivered':
      return styles.statusDelivered;
    default:
      return styles.statusCancelled;
  }
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span className={`${styles.statusBadge} ${statusClassName(meta.tone)}`}>{meta.shortLabel}</span>
  );
}

function OrderTypeIcon({ type }: { type: Order['type'] }) {
  if (type === 'delivery') {
    return <DeliveryDiningOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />;
  }
  return <StorefrontOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />;
}

function OrderTicketCard({
  order,
  selected,
  now,
  onSelect,
}: {
  order: Order;
  selected: boolean;
  now: number;
  onSelect: (orderId: string) => void;
}) {
  const itemCount = countOrderItems(order.items);
  const previewItems = order.items
    .slice(0, 2)
    .map((item) => `${item.quantity}× ${item.product_name}`)
    .join(' · ');
  const moreItems = order.items.length > 2 ? ` +${order.items.length - 2}` : '';

  return (
    <button
      type="button"
      className={`${styles.ticket} ${selected ? styles.ticketSelected : ''} ${
        order.status === 'pending' ? styles.ticketPending : ''
      }`}
      onClick={() => onSelect(order.id)}
      aria-current={selected ? 'true' : undefined}
    >
      <div className={styles.ticketTop}>
        <span className={styles.ticketId}>#{formatOrderDisplayId(order)}</span>
        <span className={styles.ticketTime}>{formatOrderElapsed(order.created_at, now)}</span>
      </div>
      <div className={styles.ticketMeta}>
        <span className={styles.ticketCustomer}>{order.customer_name}</span>
        <OrderStatusBadge status={order.status} />
        <span className={styles.typePill}>
          <OrderTypeIcon type={order.type} />
          {order.type === 'delivery' ? 'Envío' : 'Para llevar'}
        </span>
      </div>
      <p className={styles.ticketSummary}>
        {itemCount === 1 ? '1 artículo' : `${itemCount} artículos`} · {formatCents(order.total_cents)}
        {previewItems ? ` · ${previewItems}${moreItems}` : ''}
      </p>
    </button>
  );
}

function OrderItemCard({
  item,
  productsById,
  promotions,
}: {
  item: OrderItem;
  productsById: ReadonlyMap<string, Product>;
  promotions: Promotion[];
}) {
  const options = resolveOrderItemOptions(item, productsById);
  const imageUrl = storagePublicUrl(item.product_image_path);
  const product = item.product_id ? productsById.get(item.product_id) : undefined;
  const itemDiscounts = resolveOrderItemDiscounts(item, { product, promotions });
  const preDiscountCents = orderItemPreDiscountCents(item, itemDiscounts);

  return (
    <article className={styles.itemCard}>
      <div className={styles.itemRow}>
        <div className={styles.itemThumbWrap}>
          {imageUrl ? (
            <img src={imageUrl} alt="" className={styles.itemThumb} />
          ) : (
            <div className={styles.itemThumbFallback} aria-hidden />
          )}
        </div>
        <div className={styles.itemBody}>
          <div className={styles.itemTop}>
            <h3 className={styles.itemName}>
              <span className={styles.itemQty}>{item.quantity}×</span> {item.product_name}
            </h3>
            <span className={styles.itemTotal}>{formatCents(preDiscountCents)}</span>
          </div>

          {options.length > 0 ? (
            <div className={styles.itemOptions}>
              {options.map((group) => (
                <p key={`${item.id}-${group.groupTitle}`} className={styles.itemOptionRow}>
                  <span className={styles.itemOptionGroup}>{group.groupTitle}: </span>
                  {group.labels.join(', ')}
                </p>
              ))}
            </div>
          ) : null}

          {itemDiscounts.length > 0 ? (
            <ul className={styles.discountList}>
              {itemDiscounts.map((discount) => (
                <li key={`${item.id}-${discount.label}-${discount.discount_cents}`} className={styles.discountRow}>
                  <span>
                    {discount.label}
                    {discount.badge ? ` · ${discount.badge}` : ''}
                  </span>
                  <span className={styles.discountAmount}>
                    {discount.discount_cents > 0 ? `-${formatCents(discount.discount_cents)}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={styles.itemMeta}>
            <span>Base {formatCents(item.unit_price_cents)} c/u</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function OrderDetailContent({
  order,
  productsById,
  promotions,
  now,
  updating,
  showBack,
  onBack,
  onAdvance,
  onCancel,
}: {
  order: Order;
  productsById: ReadonlyMap<string, Product>;
  promotions: Promotion[];
  now: number;
  updating: boolean;
  showBack?: boolean;
  onBack?: () => void;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const meta = ORDER_STATUS_META[order.status];
  const itemCount = countOrderItems(order.items);
  const noteParts = splitOrderNote(order.note);
  const orderRef = extractOrderRefFromNote(order.note);
  const mapsUrl = buildOrderGoogleMapsUrl(order);
  const totals = buildOrderTotalsBreakdown(order);
  const lineDiscountRows = useMemo(
    () => collectOrderDiscountRows(order.items, productsById, promotions),
    [order.items, productsById, promotions],
  );

  const showActions = meta.nextActionLabel || canCancelOrder(order.status);

  return (
    <>
      <header className={styles.detailHeader}>
        {showBack ? (
          <button type="button" className={styles.backBtn} aria-label="Volver a la lista" onClick={onBack}>
            <ArrowBackIcon fontSize="small" />
          </button>
        ) : null}
        <div className={styles.detailHeaderMain}>
          <div>
            <h2 className={styles.detailId}>Pedido #{formatOrderDisplayId(order)}</h2>
            <p className={styles.detailSub}>
              {formatOrderDateTime(order.created_at)} · {formatOrderElapsed(order.created_at, now)} ·{' '}
              {formatOrderClock(order.created_at)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </header>

      <div className={styles.detailScroll}>
        <div className={styles.detailBody}>
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <p className={styles.infoLabel}>Cliente</p>
            <p className={styles.infoValue}>{order.customer_name}</p>
          </div>
          <div className={styles.infoCard}>
            <p className={styles.infoLabel}>WhatsApp</p>
            <p className={styles.infoValue}>{formatOrderCustomerPhone(order.customer_phone)}</p>
          </div>
          <div className={styles.infoCard}>
            <p className={styles.infoLabel}>Tipo</p>
            <p className={styles.infoValue}>{formatOrderTypeLabel(order.type)}</p>
          </div>
          <div className={styles.infoCard}>
            <p className={styles.infoLabel}>Pago</p>
            <p className={styles.infoValue}>{formatOrderPaymentLabel(order.payment_method)}</p>
            {order.type === 'delivery' &&
            order.payment_method === 'cash' &&
            order.cash_denomination_cents != null ? (
              <p className={styles.infoMeta}>
                Pagará con {formatCents(order.cash_denomination_cents)}
                {order.cash_denomination_cents > order.total_cents
                  ? ` · Cambio ${formatCents(order.cash_denomination_cents - order.total_cents)}`
                  : ''}
              </p>
            ) : null}
          </div>
          {orderRef ? (
            <div className={`${styles.infoCard} ${styles.infoCardWide}`}>
              <p className={styles.infoLabel}>Referencia</p>
              <p className={styles.infoValue}>#{orderRef}</p>
            </div>
          ) : null}
          {order.type === 'delivery' && order.delivery_address ? (
            <div className={`${styles.infoCard} ${styles.infoCardWide}`}>
              <p className={styles.infoLabel}>Dirección de entrega</p>
              <p className={`${styles.infoValue} ${styles.addressBlock}`}>{order.delivery_address}</p>
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.mapsLink}
                >
                  <MapOutlinedIcon sx={{ fontSize: 18 }} />
                  Abrir en Google Maps
                  <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <section className={styles.itemsSection} aria-label="Artículos del pedido">
          <h3 className={styles.sectionTitle}>
            Detalle ({itemCount === 1 ? '1 artículo' : `${itemCount} artículos`})
          </h3>
          {order.items.map((item) => (
            <OrderItemCard
              key={item.id}
              item={item}
              productsById={productsById}
              promotions={promotions}
            />
          ))}
        </section>

        {noteParts.details ? (
          <div className={styles.noteCard}>
            <p className={styles.infoLabel}>Notas del cliente</p>
            <p className={styles.noteText}>{noteParts.details}</p>
          </div>
        ) : null}

        <div className={styles.totalsCard} aria-label="Totales">
          <div className={styles.totalRow}>
            <span>Subtotal productos</span>
            <span>{formatCents(totals.subtotalBeforeCents)}</span>
          </div>
          {lineDiscountRows.length > 0
            ? lineDiscountRows.map((row) => (
                <div
                  key={row.key}
                  className={`${styles.totalRow} ${styles.totalRowDiscount}`}
                >
                  <span>
                    {row.label}
                    {row.badge ? ` · ${row.badge}` : ''}
                  </span>
                  <span>-{formatCents(row.discountCents)}</span>
                </div>
              ))
            : totals.lineDiscountCents > 0 ? (
                <div className={`${styles.totalRow} ${styles.totalRowDiscount}`}>
                  <span>Descuentos por artículo</span>
                  <span>-{formatCents(totals.lineDiscountCents)}</span>
                </div>
              ) : null}
          {totals.orderDiscountCents > 0 ? (
            <div className={`${styles.totalRow} ${styles.totalRowDiscount}`}>
              <span>Descuento del pedido</span>
              <span>-{formatCents(totals.orderDiscountCents)}</span>
            </div>
          ) : null}
          <div className={`${styles.totalRow} ${styles.totalRowRestaurant}`}>
            <span>Subtotal restaurante</span>
            <span>{formatCents(totals.restaurantSubtotalCents)}</span>
          </div>
          {totals.deliveryFeeCents > 0 ? (
            <div className={styles.totalRow}>
              <span>Envío</span>
              <span>{formatCents(totals.deliveryFeeCents)}</span>
            </div>
          ) : null}
          <div className={`${styles.totalRow} ${styles.totalRowStrong}`}>
            <span>Total</span>
            <span>{formatCents(totals.totalCents)}</span>
          </div>
        </div>
        </div>
      </div>

      {showActions ? (
        <footer className={styles.detailActions}>
          {meta.nextActionLabel ? (
            <button
              type="button"
              className={styles.actionPrimary}
              disabled={updating}
              onClick={onAdvance}
            >
              {updating ? 'Actualizando…' : meta.nextActionLabel}
            </button>
          ) : null}
          {canCancelOrder(order.status) ? (
            <button
              type="button"
              className={styles.actionDanger}
              disabled={updating}
              onClick={onCancel}
            >
              Cancelar pedido
            </button>
          ) : null}
        </footer>
      ) : null}
    </>
  );
}

function OrderDetailPanel({
  order,
  productsById,
  promotions,
  now,
  updating,
  showBack,
  onBack,
  onAdvance,
  onCancel,
}: {
  order: Order | null;
  productsById: ReadonlyMap<string, Product>;
  promotions: Promotion[];
  now: number;
  updating: boolean;
  showBack?: boolean;
  onBack?: () => void;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  return (
    <section className={styles.detailPanel} aria-label="Detalle del pedido">
      {order ? (
        <OrderDetailContent
          order={order}
          productsById={productsById}
          promotions={promotions}
          now={now}
          updating={updating}
          showBack={showBack}
          onBack={onBack}
          onAdvance={onAdvance}
          onCancel={onCancel}
        />
      ) : (
        <div className={styles.detailEmpty}>
          <div>
            <p className={styles.detailEmptyTitle}>Selecciona un pedido</p>
            <p className={styles.detailEmptyText}>
              Toca un ticket de la lista para ver cliente, artículos, opciones, dirección y totales.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function KitchenOrdersView() {
  const { accessToken } = useAuth();
  const {
    restaurantId,
    orders,
    pendingOrdersCount,
    loading,
    loadError,
    refreshing,
    socketLive,
    refreshOrders,
    replaceOrder,
  } = useRestaurantOrders();

  const [productsById, setProductsById] = useState<Map<string, Product>>(new Map());
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>(DEFAULT_KITCHEN_STATUS_FILTER);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isMobile || !selectedOrderId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, selectedOrderId]);

  useEffect(() => {
    if (!accessToken || !restaurantId) return;

    let cancelled = false;
    setProductsLoading(true);

    void Promise.all([
      fetchAllPages((cursor) => listProducts(accessToken, restaurantId, 100, cursor), 100),
      listAllPromotions(accessToken, restaurantId),
    ])
      .then(([productRows, promotionRows]) => {
        if (cancelled) return;
        setProductsById(new Map(productRows.map((product) => [product.id, product])));
        setPromotions(promotionRows);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, restaurantId]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => matchesOrderStatusFilter(order.status, statusFilter)),
    [orders, statusFilter],
  );

  useEffect(() => {
    setSelectedOrderId((current) => {
      if (current && filteredOrders.some((order) => order.id === current)) return current;
      const isWide =
        typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches;
      return isWide ? filteredOrders[0]?.id ?? null : null;
    });
  }, [filteredOrders, statusFilter]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const filterCounts = useMemo(() => buildOrderStatusFilterCounts(orders), [orders]);

  const activeCount = filterCounts.active;

  const headerSubtitle = useMemo(() => {
    const liveSuffix = socketLive ? ' · en vivo' : '';
    if (statusFilter === 'new') {
      if (pendingOrdersCount === 0) {
        return `Sin pedidos nuevos · revisa Activos para el resto${liveSuffix}`;
      }
      return pendingOrdersCount === 1
        ? `1 pedido nuevo por confirmar${liveSuffix}`
        : `${pendingOrdersCount} pedidos nuevos por confirmar${liveSuffix}`;
    }
    return activeCount === 1
      ? `1 pedido activo · más recientes primero${liveSuffix}`
      : `${activeCount} pedidos activos · más recientes primero${liveSuffix}`;
  }, [statusFilter, pendingOrdersCount, activeCount, socketLive]);

  const listPanelTitle = statusFilter === 'new' ? 'Nuevos' : 'Pedidos';
  const listEmptyTitle =
    statusFilter === 'new' ? 'Sin pedidos nuevos' : 'Sin pedidos en este filtro';
  const listEmptyText =
    statusFilter === 'new'
      ? 'Los pedidos recién llegados del menú en vivo aparecerán aquí hasta que los confirmes.'
      : 'Los nuevos pedidos del menú en vivo aparecerán automáticamente.';

  const patchOrder = async (
    orderId: string,
    status: OrderStatus,
    cancellationReason?: string,
  ): Promise<Order | null> => {
    if (!accessToken || !restaurantId) return null;
    setUpdating(true);
    setActionError(null);

    try {
      const updated = await updateRestaurantOrderStatus(
        accessToken,
        restaurantId,
        orderId,
        status,
        cancellationReason,
      );
      replaceOrder(updated);
      return updated;
    } catch (error) {
      console.error(error);
      setActionError('No se pudo actualizar el estado del pedido.');
      return null;
    } finally {
      setUpdating(false);
    }
  };

  const handleAdvance = async () => {
    if (!selectedOrder) return;
    const next = ORDER_STATUS_META[selectedOrder.status].nextStatus;
    if (!next) return;
    const updated = await patchOrder(selectedOrder.id, next);
    if (!updated) return;
    if (next === 'confirmed') {
      openCustomerWhatsAppMessage(
        updated.customer_phone,
        buildOrderAcceptedWhatsAppMessage(updated),
      );
    }
  };

  const handleCancelRequest = () => {
    if (!selectedOrder) return;
    setCancelDialogOpen(true);
  };

  const handleCancelConfirm = async (reason: KitchenCancelReason) => {
    if (!selectedOrder) return;
    const updated = await patchOrder(selectedOrder.id, 'cancelled', reason);
    if (!updated) return;
    setCancelDialogOpen(false);
    openCustomerWhatsAppMessage(
      updated.customer_phone,
      buildOrderCancelledWhatsAppMessage(updated, reason),
    );
  };

  if (loading || productsLoading) {
    return (
      <div className={styles.kitchen}>
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>Cargando pedidos…</p>
          <p className={styles.stateText}>Preparando la vista de cocina.</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.kitchen}>
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>No se pudieron cargar los pedidos</p>
          <p className={styles.stateText}>{loadError}</p>
          <button type="button" className={styles.refreshBtn} onClick={refreshOrders}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.kitchen}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Cocina</h1>
          <p className={styles.subtitle}>{headerSubtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={refreshOrders}
            disabled={refreshing}
            aria-label="Actualizar pedidos"
          >
            <RefreshOutlinedIcon
              fontSize="small"
              className={refreshing ? styles.spinning : undefined}
            />
            Actualizar
          </button>
        </div>
      </header>

      <div className={styles.filters} role="tablist" aria-label="Filtrar pedidos">
        {ORDER_STATUS_FILTER_OPTIONS.map((option) => {
          const isActive = statusFilter === option.value;
          const isNewTab = option.value === 'new';
          const count = filterCounts[option.value];
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${option.label} (${count})`}
              className={`${styles.filterChip} ${isNewTab ? styles.filterChipNew : ''} ${
                isActive
                  ? `${styles.filterChipActive} ${isNewTab ? styles.filterChipNewActive : ''}`
                  : ''
              }`}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
              <span
                className={`${styles.filterChipCount} ${
                  isNewTab ? styles.filterChipCountNew : styles.filterChipCountNeutral
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {actionError ? (
        <div className={styles.noteCard} role="alert">
          <p className={styles.noteText}>{actionError}</p>
        </div>
      ) : null}

      <div className={`${styles.board} ${isMobile && selectedOrder ? styles.boardMobileDetail : ''}`}>
        <section className={styles.listPanel} aria-label="Lista de pedidos">
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>
              <ShoppingBagOutlinedIcon sx={{ fontSize: 18, verticalAlign: 'text-bottom', mr: 0.5 }} />
              {listPanelTitle}
            </h2>
            <span className={styles.listCount}>
              {filteredOrders.length === 1 ? '1 pedido' : `${filteredOrders.length} pedidos`}
            </span>
          </div>

          <div className={styles.listScroll}>
            {filteredOrders.length === 0 ? (
              <div className={styles.stateBox}>
                <p className={styles.stateTitle}>{listEmptyTitle}</p>
                <p className={styles.stateText}>{listEmptyText}</p>
              </div>
            ) : (
              filteredOrders.map((order) => (
                <OrderTicketCard
                  key={order.id}
                  order={order}
                  selected={order.id === selectedOrderId}
                  now={now}
                  onSelect={setSelectedOrderId}
                />
              ))
            )}
          </div>
        </section>

        {!isMobile ? (
          <div className={styles.detailPanelDesktop}>
            <OrderDetailPanel
              order={selectedOrder}
              productsById={productsById}
              promotions={promotions}
              now={now}
              updating={updating}
              onAdvance={handleAdvance}
              onCancel={handleCancelRequest}
            />
          </div>
        ) : null}
      </div>

      {isMobile && selectedOrder ? (
        <div className={styles.mobileOverlay}>
          <OrderDetailPanel
            order={selectedOrder}
            productsById={productsById}
            promotions={promotions}
            now={now}
            updating={updating}
            showBack
            onBack={() => setSelectedOrderId(null)}
            onAdvance={handleAdvance}
            onCancel={handleCancelRequest}
          />
        </div>
      ) : null}

      <OrderCancelDialog
        open={cancelDialogOpen}
        orderLabel={selectedOrder ? `Pedido #${formatOrderDisplayId(selectedOrder)}` : ''}
        confirming={updating}
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={(reason) => void handleCancelConfirm(reason)}
      />
    </div>
  );
}
