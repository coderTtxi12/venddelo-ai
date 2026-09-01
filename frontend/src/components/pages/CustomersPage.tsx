'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  getRestaurantCustomerActivity,
  listAllRestaurantCustomers,
  type CustomerSort,
  type CustomerSource,
  type RestaurantCustomer,
  type RestaurantCustomerActivityItem,
  type RestaurantCustomerStats,
} from '@/lib/api/customers';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import {
  CUSTOMER_SORT_LABELS,
  CUSTOMER_SOURCE_LABELS,
  activityKindLabel,
  activityStatusLabel,
  customerInitials,
  customerWhatsAppHref,
  filterCustomers,
  sortCustomers,
  visitSummary,
} from '@/lib/customers/display';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { formatOrderDateTime, formatOrderElapsed } from '@/lib/orders/orderDisplay';
import { paginateItems } from '@/lib/paginate';
import { ListPagination } from '@/components/ui/ListPagination';
import styles from './CustomersPage.module.css';

const PAGE_SIZE = 20;
const EMPTY_STATS: RestaurantCustomerStats = {
  unique_customers: 0,
  repeat_customers: 0,
  menu_customers: 0,
  delivery_customers: 0,
};

function formatCents(cents: number) {
  return formatMoney(cents / 100);
}

function sourceFilterLabel(source: CustomerSource | 'all'): string {
  if (source === 'all') return 'Todos';
  return CUSTOMER_SOURCE_LABELS[source];
}

function sourceLine(customer: RestaurantCustomer): string {
  return customer.sources.map((item) => CUSTOMER_SOURCE_LABELS[item]).join(' · ');
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [source, setSource] = useState<CustomerSource | 'all'>('all');
  const [sort, setSort] = useState<CustomerSort>('last_at');
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activityByKey, setActivityByKey] = useState<
    Record<string, RestaurantCustomerActivityItem[] | 'loading' | 'error'>
  >({});

  const loadCustomers = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) {
      setCustomers([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listAllRestaurantCustomers(accessToken, selectedRestaurantId);
      setCustomers(result.items);
      setStats(result.stats);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cargar la lista de clientes.',
      );
      setCustomers([]);
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setPage(1);
    setSelectedKey(null);
  }, [selectedRestaurantId]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, source, sort]);

  const visible = useMemo(
    () => sortCustomers(filterCustomers(customers, deferredQuery, source), sort),
    [customers, deferredQuery, source, sort],
  );
  const slice = paginateItems(visible, page, PAGE_SIZE);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.phone_key === selectedKey) ?? null,
    [customers, selectedKey],
  );

  const closeDrawer = useCallback(() => setSelectedKey(null), []);

  const loadActivity = useCallback(
    async (phoneKey: string) => {
      if (!accessToken || !selectedRestaurantId) return;
      setActivityByKey((prev) => ({ ...prev, [phoneKey]: 'loading' }));
      try {
        const activity = await getRestaurantCustomerActivity(
          accessToken,
          selectedRestaurantId,
          phoneKey,
        );
        setActivityByKey((prev) => ({ ...prev, [phoneKey]: activity.items }));
      } catch {
        setActivityByKey((prev) => ({ ...prev, [phoneKey]: 'error' }));
      }
    },
    [accessToken, selectedRestaurantId],
  );

  function selectCustomer(phoneKey: string) {
    const next = selectedKey === phoneKey ? null : phoneKey;
    setSelectedKey(next);
    if (next && activityByKey[next] == null) {
      void loadActivity(next);
    }
  }

  const searching = deferredQuery.trim().length > 0;
  const emptyAll = !loading && !error && customers.length === 0;
  const emptySearch = !loading && !error && customers.length > 0 && visible.length === 0;
  const selectedActivity = selectedKey ? activityByKey[selectedKey] : null;
  const whatsappHref = selectedCustomer
    ? customerWhatsAppHref(selectedCustomer.customer_phone, selectedCustomer.customer_name)
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Clientes</h1>
          <p className={styles.subtitle}>Agrupados por celular, del menú digital y de delivery.</p>
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
            <span className={styles.metricLabel}>Delivery</span>
          </div>
        </section>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <SearchOutlinedIcon fontSize="small" aria-hidden />
          <span className={styles.srOnly}>Buscar clientes</span>
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre o celular"
            autoComplete="off"
            aria-label="Buscar clientes"
          />
        </label>
        <div className={styles.tabs} role="group" aria-label="Canal">
          {(['all', 'menu', 'delivery'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={source === value}
              className={`${styles.tab} ${source === value ? styles.tabActive : ''}`}
              onClick={() => setSource(value)}
            >
              {sourceFilterLabel(value)}
            </button>
          ))}
        </div>
        <label className={styles.sort}>
          <span className={styles.srOnly}>Ordenar</span>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(event) => setSort(event.target.value as CustomerSort)}
          >
            {(Object.keys(CUSTOMER_SORT_LABELS) as CustomerSort[]).map((value) => (
              <option key={value} value={value}>
                {CUSTOMER_SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
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
            Cuando alguien pida por el menú digital o envíes un delivery, aparecerá aquí.
          </p>
        </div>
      ) : emptySearch ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Sin coincidencias</h2>
          <p className={styles.emptyText}>
            Prueba con el nombre o los últimos dígitos del celular.
          </p>
        </div>
      ) : (
        <>
          <p className={styles.counter}>
            {searching || source !== 'all'
              ? `${visible.length} de ${customers.length}`
              : `${visible.length} clientes`}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Celular</th>
                  <th>Canal</th>
                  <th>Pedidos</th>
                  <th>Gastado</th>
                  <th>Último</th>
                </tr>
              </thead>
              <tbody>
                {slice.items.map((customer) => {
                  const selected = selectedKey === customer.phone_key;
                  return (
                    <tr
                      key={customer.phone_key}
                      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => selectCustomer(customer.phone_key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectCustomer(customer.phone_key);
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
                      <td className={styles.spent}>{formatCents(customer.total_spent_cents)}</td>
                      <td className={styles.muted}>{formatOrderElapsed(customer.last_order_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={slice.page}
            totalPages={slice.totalPages}
            totalItems={slice.totalItems}
            rangeStart={slice.rangeStart}
            rangeEnd={slice.rangeEnd}
            pageSize={PAGE_SIZE}
            itemLabel="clientes"
            onPageChange={setPage}
          />
        </>
      )}

      <Drawer
        open={selectedCustomer != null}
        title={selectedCustomer?.customer_name || 'Sin nombre'}
        onClose={closeDrawer}
      >
        {selectedCustomer ? (
          <div className={styles.detail}>
            <div className={styles.detailHero}>
              <span className={styles.detailAvatar} aria-hidden>
                {customerInitials(selectedCustomer.customer_name)}
              </span>
              <div className={styles.detailHeroCopy}>
                <p className={styles.detailPhone}>
                  {formatOrderCustomerPhone(selectedCustomer.customer_phone)}
                </p>
                <p className={styles.detailChannels}>{sourceLine(selectedCustomer) || '—'}</p>
              </div>
              {whatsappHref ? (
                <a
                  className={styles.whatsapp}
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsAppIcon fontSize="small" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
            </div>

            <dl className={styles.detailStats}>
              <div>
                <dt>Pedidos</dt>
                <dd>{visitSummary(selectedCustomer)}</dd>
              </div>
              <div>
                <dt>Gastado</dt>
                <dd>{formatCents(selectedCustomer.total_spent_cents)}</dd>
              </div>
              <div>
                <dt>Primero</dt>
                <dd>{formatOrderDateTime(selectedCustomer.first_order_at)}</dd>
              </div>
              <div>
                <dt>Último</dt>
                <dd>{formatOrderDateTime(selectedCustomer.last_order_at)}</dd>
              </div>
            </dl>

            <section className={styles.history}>
              <h3 className={styles.historyTitle}>Historial</h3>
              {selectedActivity === 'loading' || selectedActivity == null ? (
                <p className={styles.activityHint}>Cargando pedidos…</p>
              ) : selectedActivity === 'error' ? (
                <div className={styles.activityError}>
                  <p>No se pudo cargar el historial.</p>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => void loadActivity(selectedCustomer.phone_key)}
                  >
                    Reintentar
                  </button>
                </div>
              ) : selectedActivity.length === 0 ? (
                <p className={styles.activityHint}>Este cliente no tiene pedidos recientes.</p>
              ) : (
                <ul className={styles.activityList}>
                  {selectedActivity.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className={styles.activityItem}>
                      <span className={styles.activityId}>#{item.display_id}</span>
                      <span className={styles.activityKind}>
                        {activityKindLabel(item.kind, item.order_type)}
                      </span>
                      <span className={styles.activityStatus}>
                        {activityStatusLabel(item.kind, item.status)}
                      </span>
                      <span className={styles.activityAmount}>{formatCents(item.total_cents)}</span>
                      <span className={styles.activityWhen}>
                        {formatOrderDateTime(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
