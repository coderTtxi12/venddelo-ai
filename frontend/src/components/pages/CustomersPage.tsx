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
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { CustomerDetailDrawer } from '@/components/customers/CustomerDetailDrawer';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  listRestaurantCustomers,
  type CustomerSort,
  type CustomerSortOrder,
  type CustomerSource,
  type RestaurantCustomer,
  type RestaurantCustomerStats,
} from '@/lib/api/customers';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import {
  CUSTOMER_FREQUENCY_LABELS,
  CUSTOMER_RECENCY_LABELS,
  CUSTOMER_SOURCE_LABELS,
  CUSTOMER_SPEND_LABELS,
  customerFiltersActive,
  customerInitials,
  customerWhatsAppHref,
  toggleCustomerColumnSort,
  type CustomerFrequencyFilter,
  type CustomerRecencyFilter,
  type CustomerSpendFilter,
} from '@/lib/customers/display';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { formatOrderElapsed } from '@/lib/orders/orderDisplay';
import { ListPagination } from '@/components/ui/ListPagination';
import { ToolbarSelect } from '@/components/ui/ToolbarSelect';
import styles from './CustomersPage.module.css';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;
const EMPTY_STATS: RestaurantCustomerStats = {
  unique_customers: 0,
  repeat_customers: 0,
  menu_customers: 0,
  delivery_customers: 0,
};

const CHANNEL_FILTER_LABELS: Record<CustomerSource | 'all', string> = {
  all: 'Todos',
  menu: CUSTOMER_SOURCE_LABELS.menu,
  delivery: CUSTOMER_SOURCE_LABELS.delivery,
};

const MOBILE_SORT_OPTIONS: Record<string, string> = {
  'last_at:desc': 'Más recientes',
  'last_at:asc': 'Más antiguos',
  'visits:desc': 'Más pedidos',
  'visits:asc': 'Menos pedidos',
  'spent:desc': 'Mayor gasto',
  'spent:asc': 'Menor gasto',
  'name:asc': 'Nombre A–Z',
  'name:desc': 'Nombre Z–A',
};

function formatCents(cents: number) {
  return formatMoney(cents / 100);
}

function sourceLine(customer: RestaurantCustomer): string {
  return customer.sources.map((item) => CUSTOMER_SOURCE_LABELS[item]).join(' · ');
}

const SORT_COLUMN_LABELS: Record<CustomerSort, string> = {
  name: 'Cliente',
  visits: 'Pedidos',
  spent: 'Gastado',
  last_at: 'Último',
};

function SortHeader({
  column,
  sort,
  order,
  align = 'left',
  onToggle,
}: {
  column: CustomerSort;
  sort: CustomerSort;
  order: CustomerSortOrder;
  align?: 'left' | 'right';
  onToggle: (column: CustomerSort) => void;
}) {
  const active = sort === column;
  const label = SORT_COLUMN_LABELS[column];
  const nextDirection = !active
    ? column === 'name'
      ? 'ascendente'
      : 'descendente'
    : order === 'desc'
      ? 'ascendente'
      : 'descendente';
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

function CustomerCard({
  customer,
  selected,
  onSelect,
}: {
  customer: RestaurantCustomer;
  selected: boolean;
  onSelect: (customer: RestaurantCustomer) => void;
}) {
  const displayName = customer.customer_name || 'Sin nombre';
  const spent = formatCents(customer.total_spent_cents);
  return (
    <button
      type="button"
      className={`${styles.customerCard} ${selected ? styles.customerCardSelected : ''}`}
      aria-pressed={selected}
      aria-label={`${displayName}, ${spent} gastado, ${customer.visit_count} pedidos`}
      onClick={() => onSelect(customer)}
    >
      <span className={styles.customerCardMain}>
        <span className={styles.avatar} aria-hidden>
          {customerInitials(customer.customer_name)}
        </span>
        <span className={styles.customerCardCopy}>
          <span className={styles.name}>{customer.customer_name || 'Sin nombre'}</span>
          <span className={styles.customerCardPhone}>
            {formatOrderCustomerPhone(customer.customer_phone)}
          </span>
          <span className={styles.customerCardMeta}>
            {sourceLine(customer) || 'Sin canal'} · {customer.visit_count} pedidos
          </span>
        </span>
      </span>
      <span className={styles.customerCardAside}>
        <span className={styles.customerCardSpent}>{formatCents(customer.total_spent_cents)}</span>
        <span className={styles.customerCardWhen}>{formatOrderElapsed(customer.last_order_at)}</span>
        <ChevronRightOutlinedIcon className={styles.customerCardChevron} fontSize="small" aria-hidden />
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

export default function CustomersPage() {
  const { accessToken } = useAuth();
  const { selectedRestaurantId } = useRestaurantAccess();
  const [customers, setCustomers] = useState<RestaurantCustomer[]>([]);
  const [stats, setStats] = useState<RestaurantCustomerStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [source, setSource] = useState<CustomerSource | 'all'>('all');
  const [frequency, setFrequency] = useState<CustomerFrequencyFilter>('all');
  const [spend, setSpend] = useState<CustomerSpendFilter>('all');
  const [recency, setRecency] = useState<CustomerRecencyFilter>('all');
  const [sort, setSort] = useState<CustomerSort>('last_at');
  const [order, setOrder] = useState<CustomerSortOrder>('desc');
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<RestaurantCustomer | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const listFilters = useMemo(
    () => ({ query: debouncedQuery, source, frequency, spend, recency }),
    [debouncedQuery, frequency, recency, source, spend],
  );
  const filtersActive = customerFiltersActive(listFilters);

  const resetPagination = useCallback(() => {
    setListCursor(null);
    setCursorStack([]);
    setNextCursor(null);
  }, []);

  const loadCustomers = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) {
      setCustomers([]);
      setStats(EMPTY_STATS);
      setTotal(0);
      setLoading(false);
      setHasLoaded(true);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listRestaurantCustomers(accessToken, selectedRestaurantId, PAGE_SIZE, {
        q: debouncedQuery.trim() || undefined,
        source: source === 'all' ? undefined : source,
        frequency: frequency === 'all' ? undefined : frequency,
        spend: spend === 'all' ? undefined : spend,
        recency: recency === 'all' ? undefined : recency,
        sort,
        order,
        cursor: listCursor,
      });
      if (requestId !== requestIdRef.current) return;
      setCustomers(result.items);
      setStats(result.stats);
      setTotal(result.total);
      setNextCursor(result.next_cursor);
      setHasLoaded(true);
      if (result.total > 0 && result.items.length === 0 && listCursor) {
        resetPagination();
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cargar la lista de clientes.',
      );
      setCustomers([]);
      setStats(EMPTY_STATS);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [
    accessToken,
    debouncedQuery,
    frequency,
    listCursor,
    recency,
    selectedRestaurantId,
    sort,
    order,
    source,
    spend,
    resetPagination,
  ]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    resetPagination();
    setSelectedCustomer(null);
    setHasLoaded(false);
  }, [selectedRestaurantId, resetPagination]);

  const closeDrawer = useCallback(() => setSelectedCustomer(null), []);

  function selectCustomer(customer: RestaurantCustomer) {
    const next = selectedCustomer?.phone_key === customer.phone_key ? null : customer;
    setSelectedCustomer(next);
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

  function toggleSort(column: CustomerSort) {
    const next = toggleCustomerColumnSort({ sort, order }, column);
    setSort(next.sort);
    setOrder(next.order);
    resetPagination();
  }

  function clearFilters() {
    setQuery('');
    setDebouncedQuery('');
    setSource('all');
    setFrequency('all');
    setSpend('all');
    setRecency('all');
    resetPagination();
  }

  const page = cursorStack.length + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + customers.length, total);
  const showFullLoading = loading && !hasLoaded;
  const emptyAll = hasLoaded && !error && stats.unique_customers === 0;
  const emptySearch = hasLoaded && !error && stats.unique_customers > 0 && total === 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Clientes</h1>
          <p className={styles.subtitle}>Agrupados por celular, del menú digital y pedidos manuales.</p>
        </div>
        <section className={styles.metrics} aria-label="Resumen de clientes">
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.unique_customers}</span>
            <span className={styles.metricLabel}>Clientes</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.repeat_customers}</span>
            <span className={styles.metricLabel}>Recurrentes</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.menu_customers}</span>
            <span className={styles.metricLabel}>Menú</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.delivery_customers}</span>
            <span className={styles.metricLabel}>Manual</span>
          </div>
        </section>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchField} htmlFor="customers-search">
          <span className={styles.searchLabel}>Buscar</span>
          <div className={`${styles.searchWrap} ${query ? styles.searchWrapActive : ''}`}>
            <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
            <input
              id="customers-search"
              className={styles.searchInput}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                goToFirstPage();
              }}
              placeholder="Nombre o celular"
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

      <div className={styles.filters} role="group" aria-label="Filtros de clientes">
        <div className={styles.mobileSort}>
          <ToolbarSelect
            label="Ordenar"
            value={`${sort}:${order}`}
            options={MOBILE_SORT_OPTIONS}
            onChange={(value) => {
              const [nextSort, nextOrder] = value.split(':') as [CustomerSort, CustomerSortOrder];
              setSort(nextSort);
              setOrder(nextOrder);
              goToFirstPage();
            }}
          />
        </div>
        <ToolbarSelect
          label="Canal"
          value={source}
          options={CHANNEL_FILTER_LABELS}
          active={source !== 'all'}
          onChange={(value) => {
            setSource(value);
            goToFirstPage();
          }}
        />
        <ToolbarSelect
          label="Pedidos"
          value={frequency}
          options={CUSTOMER_FREQUENCY_LABELS}
          active={frequency !== 'all'}
          onChange={(value) => {
            setFrequency(value);
            goToFirstPage();
          }}
        />
        <ToolbarSelect
          label="Gastado"
          value={spend}
          options={CUSTOMER_SPEND_LABELS}
          active={spend !== 'all'}
          onChange={(value) => {
            setSpend(value);
            goToFirstPage();
          }}
        />
        <ToolbarSelect
          label="Último"
          value={recency}
          options={CUSTOMER_RECENCY_LABELS}
          active={recency !== 'all'}
          onChange={(value) => {
            setRecency(value);
            goToFirstPage();
          }}
        />
        {filtersActive ? (
          <button type="button" className={styles.clearFilters} onClick={clearFilters}>
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {showFullLoading ? (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>Cargando clientes…</p>
          <p className={styles.stateText}>Agrupamos pedidos del menú y envíos manuales por celular.</p>
        </div>
      ) : error ? (
        <div className={`${styles.stateBox} ${styles.stateError}`}>
          <div>
            <p className={styles.stateTitle}>No se pudo cargar</p>
            <p className={styles.stateText}>{error}</p>
          </div>
          <button type="button" className={styles.retryButton} onClick={() => void loadCustomers()}>
            <ReplayOutlinedIcon fontSize="small" aria-hidden />
            Reintentar
          </button>
        </div>
      ) : emptyAll ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Aún no hay clientes</h2>
          <p className={styles.emptyText}>
            Cuando alguien pida por el menú digital o registres un pedido manual, aparecerá aquí.
          </p>
        </div>
      ) : emptySearch ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Sin coincidencias</h2>
          <p className={styles.emptyText}>
            Prueba otro nombre, celular o quita los filtros.
          </p>
        </div>
      ) : (
        <>
          <p className={styles.counter}>
            {filtersActive
              ? `${total} de ${stats.unique_customers}`
              : `${total} clientes`}
          </p>
          <div className={`${styles.tableWrap} ${loading ? styles.tableLoading : ''}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortHeader column="name" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Celular</th>
                  <th>Canal</th>
                  <SortHeader
                    column="visits"
                    sort={sort}
                    order={order}
                    align="right"
                    onToggle={toggleSort}
                  />
                  <SortHeader
                    column="spent"
                    sort={sort}
                    order={order}
                    align="right"
                    onToggle={toggleSort}
                  />
                  <SortHeader column="last_at" sort={sort} order={order} onToggle={toggleSort} />
                  <th className={styles.whatsappCol} aria-label="WhatsApp">
                    <span className={styles.srOnly}>WhatsApp</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const selected = selectedCustomer?.phone_key === customer.phone_key;
                  const whatsappHref = customerWhatsAppHref(
                    customer.customer_phone,
                    customer.customer_name,
                  );
                  return (
                    <tr
                      key={customer.phone_key}
                      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => selectCustomer(customer)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectCustomer(customer);
                        }
                      }}
                    >
                      <td>
                        <span className={styles.identity}>
                          <span className={styles.avatar} aria-hidden>
                            {customerInitials(customer.customer_name)}
                          </span>
                          <span className={styles.name}>
                            {customer.customer_name || 'Sin nombre'}
                          </span>
                        </span>
                      </td>
                      <td className={styles.muted}>
                        {formatOrderCustomerPhone(customer.customer_phone)}
                      </td>
                      <td className={styles.muted}>{sourceLine(customer) || '—'}</td>
                      <td className={styles.numeric}>{customer.visit_count}</td>
                      <td className={styles.spent} title="Solo pedidos entregados">
                        {formatCents(customer.total_spent_cents)}
                      </td>
                      <td className={styles.muted}>{formatOrderElapsed(customer.last_order_at)}</td>
                      <td className={styles.whatsappCol}>
                        {whatsappHref ? (
                          <a
                            className={styles.whatsappIconBtn}
                            href={whatsappHref}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${customer.customer_name || 'cliente'}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <WhatsAppIcon fontSize="small" aria-hidden />
                          </a>
                        ) : (
                          <span className={styles.whatsappEmpty} aria-hidden>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`${styles.cardList} ${loading ? styles.tableLoading : ''}`}>
            {customers.map((customer) => (
              <CustomerCard
                key={customer.phone_key}
                customer={customer}
                selected={selectedCustomer?.phone_key === customer.phone_key}
                onSelect={selectCustomer}
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
            itemLabel="clientes"
            loading={loading}
            onPageChange={handlePageChange}
            className={styles.pagination}
          />
        </>
      )}

      <Drawer
        open={selectedCustomer != null}
        title={selectedCustomer?.customer_name || 'Sin nombre'}
        onClose={closeDrawer}
      >
        {selectedCustomer && accessToken && selectedRestaurantId ? (
          <CustomerDetailDrawer
            key={selectedCustomer.phone_key}
            customer={selectedCustomer}
            accessToken={accessToken}
            restaurantId={selectedRestaurantId}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
