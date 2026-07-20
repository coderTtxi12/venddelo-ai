'use client';

import { useEffect, useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { updateRestaurantOrderStatus } from '@/lib/api/orders';
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
  KITCHEN_ARCHIVE_FILTER_OPTIONS,
  KITCHEN_VIEW_FILTER_OPTIONS,
  KITCHEN_WORKFLOW_FILTER_OPTIONS,
  ORDER_STATUS_META,
  type OrderStatusFilterOption,
  type OrderStatusMeta,
} from '@/lib/orders/orderStatus';
import { useKitchenOrderProducts } from '@/lib/orders/useKitchenOrderProducts';
import { useKitchenOrdersInfiniteScroll } from '@/lib/orders/useKitchenOrdersInfiniteScroll';
import { OrderCancelDialog } from '@/components/orders/OrderCancelDialog';
import { KitchenLiveIndicator } from '@/components/orders/KitchenLiveIndicator';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import {
  buildOrderAcceptedWhatsAppMessage,
  buildOrderCancelledWhatsAppMessage,
  openCustomerWhatsAppMessage,
  type KitchenCancelReason,
} from '@/lib/orders/kitchenWhatsApp';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import styles from './OrdersKitchen.module.css';

const EMPTY_PROMOTIONS: Promotion[] = [];

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

function filterToneClassName(tone: OrderStatusMeta['tone'] | undefined): string {
  switch (tone) {
    case 'pending':
      return styles.filterChipTonePending;
    case 'confirmed':
      return styles.filterChipToneConfirmed;
    case 'preparing':
      return styles.filterChipTonePreparing;
    case 'ready':
      return styles.filterChipToneReady;
    case 'delivered':
      return styles.filterChipToneDelivered;
    case 'cancelled':
      return styles.filterChipToneCancelled;
    default:
      return '';
  }
}

function StatusFilterChip({
  option,
  isActive,
  count,
  onSelect,
}: {
  option: OrderStatusFilterOption;
  isActive: boolean;
  count: number;
  onSelect: (value: OrderStatusFilter) => void;
}) {
  const isWorkflow = option.group === 'workflow';
  const isArchive = option.group === 'archive';
  const isNewTab = option.value === 'new';
  const toneClass = isWorkflow || isArchive ? filterToneClassName(option.tone) : '';
  const chipVariantClass = isWorkflow
    ? styles.filterChipWorkflow
    : isArchive
      ? styles.filterChipArchive
      : styles.filterChipView;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`${option.label} (${count})`}
      className={[
        styles.filterChip,
        chipVariantClass,
        toneClass,
        isNewTab ? styles.filterChipNew : '',
        isActive && !isNewTab && !toneClass ? styles.filterChipActive : '',
        isActive && isNewTab ? styles.filterChipNewActive : '',
        isActive && toneClass && !isNewTab ? styles.filterChipToneActive : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(option.value)}
    >
      {option.label}
      <span
        className={[
          styles.filterChipCount,
          isNewTab ? styles.filterChipCountNew : styles.filterChipCountNeutral,
          isActive && toneClass && !isNewTab ? styles.filterChipCountTone : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {count}
      </span>
    </button>
  );
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
  productsLoading,
  promotions,
}: {
  item: OrderItem;
  productsById: ReadonlyMap<string, Product>;
  productsLoading: boolean;
  promotions: Promotion[];
}) {
  const options = resolveOrderItemOptions(item, productsById);
  const hasSelectedOptions =
    item.selected_options != null && Object.keys(item.selected_options).length > 0;
  const optionsPending =
    productsLoading &&
    Boolean(item.product_id) &&
    !productsById.has(item.product_id);
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

          {optionsPending ? (
            <p className={styles.itemOptionsLoading}>Cargando opciones…</p>
          ) : options.length > 0 ? (
            <div className={styles.itemOptions}>
              {options.map((group) => (
                <p key={`${item.id}-${group.groupId}`} className={styles.itemOptionRow}>
                  <span className={styles.itemOptionGroup}>{group.groupTitle}: </span>
                  {group.labels.join(', ')}
                </p>
              ))}
            </div>
          ) : hasSelectedOptions ? (
            <p className={styles.itemOptionsLoading}>Opciones no disponibles</p>
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
  productsLoading,
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
  productsLoading: boolean;
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
              productsLoading={productsLoading}
              promotions={EMPTY_PROMOTIONS}
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
  productsLoading,
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
  productsLoading: boolean;
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
          productsLoading={productsLoading}
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
    ordersHasMore,
    kitchenFilter,
    setKitchenFilter,
    filterCounts,
    pendingOrdersCount,
    loading,
    loadingMore,
    loadError,
    socketStatus,
    refreshOrders,
    loadMoreOrders,
    replaceOrder,
  } = useRestaurantOrders();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
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

  const loadMoreSentinelRef = useKitchenOrdersInfiniteScroll(
    !loading,
    ordersHasMore,
    loadingMore,
    loadMoreOrders,
  );

  useEffect(() => {
    setSelectedOrderId((current) => {
      if (current && orders.some((order) => order.id === current)) return current;
      const isWide =
        typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches;
      return isWide ? orders[0]?.id ?? null : null;
    });
  }, [orders, kitchenFilter]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const { productsById, isLoading: productsLoading } = useKitchenOrderProducts(
    accessToken,
    restaurantId,
    selectedOrder,
  );

  const activeCount = filterCounts.active;

  const headerSubtitle = useMemo(() => {
    if (kitchenFilter === 'new') {
      if (pendingOrdersCount === 0) {
        return 'Sin pedidos nuevos · revisa Activos para el resto';
      }
      return pendingOrdersCount === 1
        ? '1 pedido nuevo por confirmar'
        : `${pendingOrdersCount} pedidos nuevos por confirmar`;
    }
    return activeCount === 1
      ? '1 pedido activo · más recientes primero'
      : `${activeCount} pedidos activos · más recientes primero`;
  }, [kitchenFilter, pendingOrdersCount, activeCount]);

  const listPanelTitle = kitchenFilter === 'new' ? 'Nuevos' : 'Pedidos';
  const listEmptyTitle =
    kitchenFilter === 'new' ? 'Sin pedidos nuevos' : 'Sin pedidos en este filtro';
  const listEmptyText =
    kitchenFilter === 'new'
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

  if (loading) {
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
          <KitchenLiveIndicator status={socketStatus} />
        </div>
      </header>

      <div className={styles.filtersBar}>
        <div className={styles.filterWorkflow} role="tablist" aria-label="Flujo de pedidos">
          {KITCHEN_WORKFLOW_FILTER_OPTIONS.map((option, index) => (
            <div key={option.value} className={styles.filterFlowStep}>
              {index > 0 ? (
                <span className={styles.filterFlowArrow} aria-hidden>
                  ›
                </span>
              ) : null}
              <StatusFilterChip
                option={option}
                isActive={kitchenFilter === option.value}
                count={filterCounts[option.value]}
                onSelect={setKitchenFilter}
              />
            </div>
          ))}
        </div>

        <div className={styles.filterSideGroups}>
          <div className={styles.filterArchiveGroup} role="tablist" aria-label="Pedidos cerrados">
            {KITCHEN_ARCHIVE_FILTER_OPTIONS.map((option) => (
              <StatusFilterChip
                key={option.value}
                option={option}
                isActive={kitchenFilter === option.value}
                count={filterCounts[option.value]}
                onSelect={setKitchenFilter}
              />
            ))}
          </div>

          <div className={styles.filterViewGroup} role="tablist" aria-label="Vistas generales">
            {KITCHEN_VIEW_FILTER_OPTIONS.map((option) => (
              <StatusFilterChip
                key={option.value}
                option={option}
                isActive={kitchenFilter === option.value}
                count={filterCounts[option.value]}
                onSelect={setKitchenFilter}
              />
            ))}
          </div>
        </div>
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
              {orders.length === 1 ? '1 pedido' : `${orders.length} pedidos`}
            </span>
          </div>

          <div className={styles.listScroll}>
            {orders.length === 0 ? (
              <div className={styles.stateBox}>
                <p className={styles.stateTitle}>{listEmptyTitle}</p>
                <p className={styles.stateText}>{listEmptyText}</p>
              </div>
            ) : (
              orders.map((order) => (
                <OrderTicketCard
                  key={order.id}
                  order={order}
                  selected={order.id === selectedOrderId}
                  now={now}
                  onSelect={setSelectedOrderId}
                />
              ))
            )}
            {loadingMore ? (
              <p className={styles.stateText}>Cargando más pedidos…</p>
            ) : null}
            <div ref={loadMoreSentinelRef} aria-hidden className={styles.loadMoreSentinel} />
          </div>
        </section>

        {!isMobile ? (
          <div className={styles.detailPanelDesktop}>
            <OrderDetailPanel
              order={selectedOrder}
              productsById={productsById}
              productsLoading={productsLoading}
              promotions={EMPTY_PROMOTIONS}
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
            productsLoading={productsLoading}
            promotions={EMPTY_PROMOTIONS}
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
