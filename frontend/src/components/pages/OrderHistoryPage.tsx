'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { OrderHistoryDetailDrawer } from '@/components/orders/OrderHistoryDetailDrawer';
import { ListPagination } from '@/components/ui/ListPagination';
import { ToolbarSelect } from '@/components/ui/ToolbarSelect';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  getRestaurantOrderSummary,
  listRestaurantOrders,
} from '@/lib/api/orders';
import type { Order, OrderStatusSummary } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import {
  HISTORY_MOBILE_SORT_OPTIONS,
  HISTORY_PAYMENT_LABELS,
  HISTORY_RECENCY_LABELS,
  HISTORY_STATUS_LABELS,
  HISTORY_TYPE_LABELS,
  historyFiltersActive,
  resolveHistoryDateBounds,
  toggleHistoryColumnSort,
  type HistoryPaymentFilter,
  type HistoryRecencyFilter,
  type HistorySort,
  type HistorySortOrder,
  type HistoryStatusFilter,
  type HistoryTypeFilter,
} from '@/lib/orders/historyFilters';
import {
  formatCents,
  formatOrderDisplayId,
  formatOrderElapsed,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
} from '@/lib/orders/orderDisplay';
import { EMPTY_ORDER_STATUS_SUMMARY } from '@/lib/orders/orderStatus';
import styles from './OrderHistoryPage.module.css';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

const SORT_COLUMN_LABELS: Record<HistorySort, string> = {
  created_at: 'Fecha',
  total_cents: 'Total',
};

function statusLabel(status: Order['status']): string {
  if (status === 'delivered') return 'Entregado';
  if (status === 'cancelled') return 'Cancelado';
  return status;
}

function SortHeader({
  column,
  sort,
  order,
  align = 'left',
  onToggle,
}: {
  column: HistorySort;
  sort: HistorySort;
  order: HistorySortOrder;
  align?: 'left' | 'right';
  onToggle: (column: HistorySort) => void;
}) {
  const active = sort === column;
  const label = SORT_COLUMN_LABELS[column];
  const nextDirection = !active ? 'descendente' : order === 'desc' ? 'ascendente' : 'descendente';
  return (
    <th aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`${styles.sortBtn} ${align === 'right' ? styles.sortBtnRight : ''} ${
          active ? styles.sortBtnOn : ''
        }`}
        aria-label={`Ordenar ${label.toLowerCase()} de forma ${nextDirection}`}
        onClick={() => onToggle(column)}
      >
        <span>{label}</span>
        <span className={styles.sortDir} aria-hidden>
          <span className={active && order === 'asc' ? styles.sortDirActive : styles.sortDirIdle}>
            ↑
          </span>
          <span className={active && order === 'desc' ? styles.sortDirActive : styles.sortDirIdle}>
            ↓
          </span>
        </span>
      </button>
    </th>
  );
}

function OrderCard({
  order,
  selected,
  now,
  onSelect,
}: {
  order: Order;
  selected: boolean;
  now: number;
  onSelect: (order: Order) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.orderCard} ${selected ? styles.orderCardSelected : ''}`}
      aria-pressed={selected}
      aria-label={`Pedido ${formatOrderDisplayId(order)}, ${order.customer_name}, ${formatCents(order.total_cents)}, ${statusLabel(order.status)}`}
      onClick={() => onSelect(order)}
    >
      <span className={styles.orderCardMain}>
        <span className={styles.orderCardCopy}>
          <span className={styles.name}>#{formatOrderDisplayId(order)}</span>
          <span className={styles.orderCardPhone}>{order.customer_name || 'Sin nombre'}</span>
          <span className={styles.orderCardMeta}>
            {formatOrderTypeLabel(order.type)} · {formatOrderPaymentLabel(order.payment_method)}
          </span>
        </span>
      </span>
      <span className={styles.orderCardAside}>
        <span className={styles.orderCardSpent}>{formatCents(order.total_cents)}</span>
        <span
          className={`${styles.statusBadge} ${
            order.status === 'delivered' ? styles.statusDelivered : styles.statusCancelled
          }`}
        >
          {statusLabel(order.status)}
        </span>
        <span className={styles.orderCardWhen}>{formatOrderElapsed(order.created_at, now)}</span>
        <ChevronRightOutlinedIcon className={styles.orderCardChevron} fontSize="small" aria-hidden />
      </span>
    </button>
  );
}

function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open, title]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <div
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.drawerHandle} aria-hidden />
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.iconBtn}
            onClick={onClose}
            aria-label="Cerrar"
          >
            <CloseOutlinedIcon fontSize="small" aria-hidden />
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </div>
    </div>
  );
}

export default function OrderHistoryPage() {
  const { accessToken } = useAuth();
  const { selectedRestaurantId } = useRestaurantAccess();
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderStatusSummary>(EMPTY_ORDER_STATUS_SUMMARY);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState<HistoryStatusFilter>('all');
  const [type, setType] = useState<HistoryTypeFilter>('all');
  const [payment, setPayment] = useState<HistoryPaymentFilter>('all');
  const [recency, setRecency] = useState<HistoryRecencyFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sort, setSort] = useState<HistorySort>('created_at');
  const [order, setOrder] = useState<HistorySortOrder>('desc');
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const dateBounds = useMemo(
    () =>
      resolveHistoryDateBounds({
        recency,
        customFrom,
        customTo,
      }),
    [customFrom, customTo, recency],
  );

  const filtersActive = historyFiltersActive({
    query: debouncedQuery,
    status,
    type,
    payment,
    recency,
    customFrom,
    customTo,
  });

  const resetPagination = useCallback(() => {
    setListCursor(null);
    setCursorStack([]);
    setNextCursor(null);
  }, []);

  const loadSummary = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) {
      setSummary(EMPTY_ORDER_STATUS_SUMMARY);
      return;
    }
    try {
      const next = await getRestaurantOrderSummary(accessToken, selectedRestaurantId, 'history');
      setSummary({ ...EMPTY_ORDER_STATUS_SUMMARY, ...next, delivery: next.delivery ?? 0 });
    } catch {
      setSummary(EMPTY_ORDER_STATUS_SUMMARY);
    }
  }, [accessToken, selectedRestaurantId]);

  const loadOrders = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) {
      setOrders([]);
      setTotal(0);
      setLoading(false);
      setHasLoaded(true);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listRestaurantOrders(
        accessToken,
        selectedRestaurantId,
        PAGE_SIZE,
        listCursor,
        {
          board: 'history',
          status: status === 'all' ? undefined : status,
          q: debouncedQuery.trim() || undefined,
          type: type === 'all' ? undefined : type,
          payment_method: payment === 'all' ? undefined : payment,
          from: dateBounds.from,
          to: dateBounds.to,
          sort,
          order,
        },
      );
      if (requestId !== requestIdRef.current) return;
      setOrders(result.items);
      setTotal(result.total ?? result.items.length);
      setNextCursor(result.next_cursor);
      setHasLoaded(true);
      if ((result.total ?? 0) > 0 && result.items.length === 0 && listCursor) {
        resetPagination();
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial.');
      setOrders([]);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [
    accessToken,
    dateBounds.from,
    dateBounds.to,
    debouncedQuery,
    listCursor,
    order,
    payment,
    resetPagination,
    selectedRestaurantId,
    sort,
    status,
    type,
  ]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    resetPagination();
    setSelectedOrder(null);
    setHasLoaded(false);
  }, [selectedRestaurantId, resetPagination]);

  const closeDrawer = useCallback(() => setSelectedOrder(null), []);

  function selectOrder(nextOrder: Order) {
    setSelectedOrder((current) => (current?.id === nextOrder.id ? null : nextOrder));
  }

  function goToFirstPage() {
    resetPagination();
  }

  function goToNextPage() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, listCursor]);
    setListCursor(nextCursor);
  }

  function goToPreviousPage() {
    if (cursorStack.length === 0) return;
    const previousCursor = cursorStack[cursorStack.length - 1] ?? null;
    setCursorStack((stack) => stack.slice(0, -1));
    setListCursor(previousCursor);
  }

  function handlePageChange(nextPage: number) {
    const currentPage = cursorStack.length + 1;
    if (nextPage < currentPage) goToPreviousPage();
    else if (nextPage > currentPage) goToNextPage();
  }

  function toggleSort(column: HistorySort) {
    const next = toggleHistoryColumnSort({ sort, order }, column);
    setSort(next.sort);
    setOrder(next.order);
    resetPagination();
  }

  function clearFilters() {
    setQuery('');
    setDebouncedQuery('');
    setStatus('all');
    setType('all');
    setPayment('all');
    setRecency('all');
    setCustomFrom('');
    setCustomTo('');
    resetPagination();
  }

  const page = cursorStack.length + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + orders.length, total);
  const showFullLoading = loading && !hasLoaded;
  const emptyAll = hasLoaded && !error && summary.total === 0;
  const emptySearch = hasLoaded && !error && summary.total > 0 && total === 0;

  const recencyOptions: Record<string, string> = {
    ...HISTORY_RECENCY_LABELS,
    custom: 'Personalizado',
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Historial</h1>
          <p className={styles.subtitle}>Pedidos entregados y cancelados.</p>
        </div>
        <section className={styles.metrics} aria-label="Resumen del historial">
          <div className={styles.metric}>
            <span className={styles.metricValue}>{summary.total}</span>
            <span className={styles.metricLabel}>Total</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{summary.delivered}</span>
            <span className={styles.metricLabel}>Entregados</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{summary.cancelled}</span>
            <span className={styles.metricLabel}>Cancelados</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{summary.delivery}</span>
            <span className={styles.metricLabel}>Entrega</span>
          </div>
        </section>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchField} htmlFor="history-search">
          <span className={styles.searchLabel}>Buscar</span>
          <div className={`${styles.searchWrap} ${query ? styles.searchWrapActive : ''}`}>
            <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
            <input
              id="history-search"
              className={styles.searchInput}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                goToFirstPage();
              }}
              placeholder="Nombre, celular o #pedido"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  goToFirstPage();
                }}
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} aria-hidden />
              </button>
            ) : null}
          </div>
        </label>
      </div>

      <div className={styles.filters} role="group" aria-label="Filtros del historial">
        <div className={styles.mobileSort}>
          <ToolbarSelect
            label="Ordenar"
            value={`${sort}:${order}`}
            options={HISTORY_MOBILE_SORT_OPTIONS}
            onChange={(value) => {
              const [nextSort, nextOrder] = value.split(':') as [HistorySort, HistorySortOrder];
              setSort(nextSort);
              setOrder(nextOrder);
              goToFirstPage();
            }}
          />
        </div>
        <ToolbarSelect
          label="Estado"
          value={status}
          options={HISTORY_STATUS_LABELS}
          active={status !== 'all'}
          onChange={(value) => {
            setStatus(value);
            goToFirstPage();
          }}
        />
        <ToolbarSelect
          label="Tipo"
          value={type}
          options={HISTORY_TYPE_LABELS}
          active={type !== 'all'}
          onChange={(value) => {
            setType(value);
            goToFirstPage();
          }}
        />
        <ToolbarSelect
          label="Pago"
          value={payment}
          options={HISTORY_PAYMENT_LABELS}
          active={payment !== 'all'}
          onChange={(value) => {
            setPayment(value);
            goToFirstPage();
          }}
        />
        <ToolbarSelect
          label="Fechas"
          value={recency}
          options={recencyOptions}
          active={recency !== 'all'}
          onChange={(value) => {
            setRecency(value as HistoryRecencyFilter);
            goToFirstPage();
          }}
        />
        {filtersActive ? (
          <button type="button" className={styles.clearFilters} onClick={clearFilters}>
            Limpiar filtros
          </button>
        ) : null}
        {recency === 'custom' ? (
          <div className={styles.customDates}>
            <label className={styles.dateField} htmlFor="history-from">
              <span className={styles.dateLabel}>Desde</span>
              <input
                id="history-from"
                className={styles.dateInput}
                type="date"
                value={customFrom}
                onChange={(event) => {
                  setCustomFrom(event.target.value);
                  goToFirstPage();
                }}
              />
            </label>
            <label className={styles.dateField} htmlFor="history-to">
              <span className={styles.dateLabel}>Hasta</span>
              <input
                id="history-to"
                className={styles.dateInput}
                type="date"
                value={customTo}
                onChange={(event) => {
                  setCustomTo(event.target.value);
                  goToFirstPage();
                }}
              />
            </label>
          </div>
        ) : null}
      </div>

      {showFullLoading ? (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>Cargando historial…</p>
          <p className={styles.stateText}>Pedidos entregados y cancelados.</p>
        </div>
      ) : error ? (
        <div className={`${styles.stateBox} ${styles.stateError}`}>
          <div>
            <p className={styles.stateTitle}>No se pudo cargar</p>
            <p className={styles.stateText}>{error}</p>
          </div>
          <button type="button" className={styles.retryButton} onClick={() => void loadOrders()}>
            <ReplayOutlinedIcon fontSize="small" aria-hidden />
            Reintentar
          </button>
        </div>
      ) : emptyAll ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Aún no hay pedidos cerrados</h2>
          <p className={styles.emptyText}>
            Cuando entregues o canceles un pedido, aparecerá aquí.
          </p>
        </div>
      ) : emptySearch ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Sin coincidencias</h2>
          <p className={styles.emptyText}>Prueba otra búsqueda o quita los filtros.</p>
        </div>
      ) : (
        <>
          <p className={styles.counter}>
            {filtersActive ? `${total} de ${summary.total}` : `${total} pedidos`}
          </p>
          <div className={`${styles.tableWrap} ${loading ? styles.tableLoading : ''}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Celular</th>
                  <th>Tipo</th>
                  <th>Pago</th>
                  <SortHeader
                    column="total_cents"
                    sort={sort}
                    order={order}
                    align="right"
                    onToggle={toggleSort}
                  />
                  <th>Estado</th>
                  <SortHeader column="created_at" sort={sort} order={order} onToggle={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {orders.map((item) => {
                  const selected = selectedOrder?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => selectOrder(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectOrder(item);
                        }
                      }}
                    >
                      <td>
                        <span className={styles.name}>#{formatOrderDisplayId(item)}</span>
                      </td>
                      <td className={styles.name}>{item.customer_name || 'Sin nombre'}</td>
                      <td className={styles.muted}>
                        {formatOrderCustomerPhone(item.customer_phone)}
                      </td>
                      <td className={styles.muted}>{formatOrderTypeLabel(item.type)}</td>
                      <td className={styles.muted}>
                        {formatOrderPaymentLabel(item.payment_method)}
                      </td>
                      <td className={styles.spent}>{formatCents(item.total_cents)}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            item.status === 'delivered'
                              ? styles.statusDelivered
                              : styles.statusCancelled
                          }`}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className={styles.muted}>{formatOrderElapsed(item.created_at, now)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`${styles.cardList} ${loading ? styles.tableLoading : ''}`}>
            {orders.map((item) => (
              <OrderCard
                key={item.id}
                order={item}
                selected={selectedOrder?.id === item.id}
                now={now}
                onSelect={selectOrder}
              />
            ))}
          </div>
          <ListPagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            pageSize={PAGE_SIZE}
            itemLabel="pedidos"
            loading={loading}
            onPageChange={handlePageChange}
            className={styles.pagination}
          />
        </>
      )}

      <Drawer
        open={selectedOrder != null}
        title={
          selectedOrder
            ? selectedOrder.customer_name || `Pedido #${formatOrderDisplayId(selectedOrder)}`
            : 'Pedido'
        }
        onClose={closeDrawer}
      >
        {selectedOrder && accessToken && selectedRestaurantId ? (
          <OrderHistoryDetailDrawer
            key={selectedOrder.id}
            order={selectedOrder}
            accessToken={accessToken}
            restaurantId={selectedRestaurantId}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
