'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import styles from './CouponsPage.module.css';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { listCategories, listProducts } from '@/lib/api/menu';
import type { Category, Coupon, CouponType, Product } from '@/lib/api/types';
import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  updateCoupon,
  type CouponInput,
} from '@/lib/api/coupons';
import { formatCouponSaveError } from '@/lib/coupons/formErrors';
import {
  couponBenefitLabel,
  couponScopeLabel,
  couponStatusLabel,
  couponStockLabel,
  couponTypeLabel,
  formatCouponExpiry,
} from '@/lib/coupons/display';
import {
  COUPON_MOBILE_SORT_OPTIONS,
  COUPON_SORT_COLUMN_LABELS,
  COUPON_STATUS_FILTER_LABELS,
  COUPON_TYPE_FILTER_LABELS,
  computeCouponStats,
  couponFiltersActive,
  filterCoupons,
  sortCoupons,
  toggleCouponColumnSort,
  type CouponListFilters,
  type CouponSort,
  type CouponSortOrder,
  type CouponStatusFilter,
  type CouponTypeFilter,
} from '@/lib/coupons/filters';
import { CouponForm, couponToFormValues } from '@/components/coupons/CouponForm';
import CouponSheet from '@/components/coupons/CouponSheet';
import { CouponApplicationsPanel } from '@/components/coupons/CouponApplicationsPanel';
import { CouponListCard } from '@/components/coupons/CouponListCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ActivePauseSwitch } from '@/components/ui/ActivePauseSwitch';
import { ToolbarSelect } from '@/components/ui/ToolbarSelect';

const SEARCH_DEBOUNCE_MS = 250;

async function loadAllCategories(token: string, restaurantId: string): Promise<Category[]> {
  const items: Category[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCategories(token, restaurantId, 20, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

async function loadAllProducts(token: string, restaurantId: string): Promise<Product[]> {
  const items: Product[] = [];
  let cursor: string | null = null;
  do {
    const page = await listProducts(token, restaurantId, 20, cursor);
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

function statusPillClass(status: Coupon['effective_status']): string {
  if (status === 'active') return styles.statusActive;
  if (status === 'scheduled') return styles.statusScheduled;
  if (status === 'expired') return styles.statusExpired;
  if (status === 'sold_out') return styles.statusSoldOut;
  return styles.statusInactive;
}

function CouponTypeIcon({ type }: { type: CouponType }) {
  if (type === 'percent') return <PercentOutlinedIcon className={styles.typeIcon} fontSize="small" />;
  if (type === 'amount') return <AttachMoneyOutlinedIcon className={styles.typeIcon} fontSize="small" />;
  return <BoltOutlinedIcon className={styles.typeIcon} fontSize="small" />;
}

function SortHeader({
  column,
  sort,
  order,
  align = 'left',
  onToggle,
}: {
  column: CouponSort;
  sort: CouponSort;
  order: CouponSortOrder;
  align?: 'left' | 'right';
  onToggle: (column: CouponSort) => void;
}) {
  const active = sort === column;
  const label = COUPON_SORT_COLUMN_LABELS[column];
  const nextDirection = !active
    ? column === 'code'
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

export default function CouponsPage() {
  const { accessToken } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [clientsCoupon, setClientsCoupon] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CouponStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<CouponTypeFilter>('all');
  const [sort, setSort] = useState<CouponSort>('created');
  const [order, setOrder] = useState<CouponSortOrder>('desc');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const listFilters = useMemo<CouponListFilters>(
    () => ({ query: debouncedQuery, status: statusFilter, type: typeFilter }),
    [debouncedQuery, statusFilter, typeFilter],
  );
  const filtersActive = couponFiltersActive(listFilters);

  const stats = useMemo(() => computeCouponStats(coupons), [coupons]);

  const visibleCoupons = useMemo(() => {
    const filtered = filterCoupons(coupons, listFilters);
    return sortCoupons(filtered, sort, order);
  }, [coupons, listFilters, sort, order]);

  const loadCoupons = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!selectedRestaurantId || !accessToken) {
        setCoupons([]);
        setNextCursor(null);
        setHasMore(false);
        setLoading(false);
        setHasLoaded(true);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const page = await listCoupons(accessToken, selectedRestaurantId, undefined, cursor);
        setCoupons((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.next_cursor);
        setHasMore(page.has_more);
        setHasLoaded(true);
      } catch (error) {
        console.error(error);
        setLoadError('No se pudieron cargar los cupones. Intenta de nuevo.');
        setHasLoaded(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accessToken, selectedRestaurantId],
  );

  const loadCatalog = useCallback(async () => {
    if (!selectedRestaurantId || !accessToken) {
      setCategories([]);
      setProducts([]);
      return;
    }
    try {
      const [categoryList, productList] = await Promise.all([
        loadAllCategories(accessToken, selectedRestaurantId),
        loadAllProducts(accessToken, selectedRestaurantId),
      ]);
      setCategories(categoryList.filter((category) => category.is_active));
      setProducts(productList.filter((product) => product.status === 'active'));
    } catch (error) {
      console.error(error);
    }
  }, [accessToken, selectedRestaurantId]);

  useEffect(() => {
    void loadCoupons();
    void loadCatalog();
  }, [loadCoupons, loadCatalog]);

  const openCreateDrawer = () => {
    setEditingCoupon(null);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openClientsDrawer = (coupon: Coupon) => {
    setClientsCoupon(coupon);
  };

  const closeClientsDrawer = () => {
    setClientsCoupon(null);
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setEditingCoupon(null);
  };

  const handleSubmit = async (payload: CouponInput) => {
    if (!selectedRestaurantId || !accessToken) return;
    setSaving(true);
    setFormError(null);
    try {
      const saved = editingCoupon
        ? await updateCoupon(accessToken, selectedRestaurantId, editingCoupon.id, payload)
        : await createCoupon(accessToken, selectedRestaurantId, payload);
      setCoupons((prev) => {
        const index = prev.findIndex((coupon) => coupon.id === saved.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      closeDrawer();
    } catch (error) {
      console.error(error);
      setFormError(formatCouponSaveError(error, editingCoupon ? 'edit' : 'create'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCoupon || !selectedRestaurantId || !accessToken) return;
    setDeleting(true);
    try {
      await deleteCoupon(accessToken, selectedRestaurantId, deletingCoupon.id);
      setCoupons((prev) => prev.filter((coupon) => coupon.id !== deletingCoupon.id));
      setDeletingCoupon(null);
    } catch (error) {
      console.error(error);
      setLoadError('No se pudo eliminar el cupón.');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon, next: boolean) => {
    if (!accessToken || !selectedRestaurantId) return;
    setTogglingIds((prev) => new Set(prev).add(coupon.id));
    setToggleErrors((prev) => {
      const { [coupon.id]: _, ...rest } = prev;
      return rest;
    });
    try {
      const updated = await updateCoupon(accessToken, selectedRestaurantId, coupon.id, {
        is_active: next,
      });
      setCoupons((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      console.error(error);
      setToggleErrors((prev) => ({
        ...prev,
        [coupon.id]: next
          ? 'No se pudo reactivar. Intenta de nuevo.'
          : 'No se pudo pausar. Intenta de nuevo.',
      }));
    } finally {
      setTogglingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(coupon.id);
        return nextSet;
      });
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2000);
    } catch {
      setCopiedCode(null);
    }
  };

  function toggleSort(column: CouponSort) {
    const next = toggleCouponColumnSort({ sort, order }, column);
    setSort(next.sort);
    setOrder(next.order);
  }

  function clearFilters() {
    setQuery('');
    setDebouncedQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
  }

  const showFullLoading = loading && !hasLoaded;
  const emptyAll = hasLoaded && !loadError && stats.total === 0;
  const emptySearch = hasLoaded && !loadError && stats.total > 0 && visibleCoupons.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Cupones</h1>
          <p className={styles.subtitle}>
            Códigos de descuento que tus clientes aplican en el menú en vivo. Se combinan con las
            promociones automáticas.
          </p>
        </div>
        <section className={styles.metrics} aria-label="Resumen de cupones">
          <div className={styles.metric}>
            <span className={styles.metricValue}>
              {stats.total}
              {hasMore ? '+' : ''}
            </span>
            <span className={styles.metricLabel}>Cupones</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.active}</span>
            <span className={styles.metricLabel}>Activos</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.uses}</span>
            <span className={styles.metricLabel}>Usos</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.inactive}</span>
            <span className={styles.metricLabel}>Inactivos</span>
          </div>
        </section>
      </header>

      {!emptyAll ? (
        <>
          <div className={styles.toolbar}>
            <label className={styles.searchField} htmlFor="coupons-search">
              <span className={styles.searchLabel}>Buscar</span>
              <div className={`${styles.searchWrap} ${query ? styles.searchWrapActive : ''}`}>
                <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
                <input
                  id="coupons-search"
                  className={styles.searchInput}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Código o nombre del cupón"
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
                    }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 18 }} aria-hidden />
                  </button>
                ) : null}
              </div>
            </label>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={openCreateDrawer}
              disabled={accessLoading || !selectedRestaurantId}
            >
              <AddOutlinedIcon fontSize="small" aria-hidden />
              Agregar cupón
            </button>
          </div>

          <div className={styles.filters} role="group" aria-label="Filtros de cupones">
            <div className={styles.mobileSort}>
              <ToolbarSelect
                label="Ordenar"
                value={`${sort}:${order}`}
                options={COUPON_MOBILE_SORT_OPTIONS}
                onChange={(value) => {
                  const [nextSort, nextOrder] = value.split(':') as [CouponSort, CouponSortOrder];
                  setSort(nextSort);
                  setOrder(nextOrder);
                }}
              />
            </div>
            <ToolbarSelect
              label="Estado"
              value={statusFilter}
              options={COUPON_STATUS_FILTER_LABELS}
              active={statusFilter !== 'all'}
              onChange={setStatusFilter}
            />
            <ToolbarSelect
              label="Tipo"
              value={typeFilter}
              options={COUPON_TYPE_FILTER_LABELS}
              active={typeFilter !== 'all'}
              onChange={setTypeFilter}
            />
            {filtersActive ? (
              <button type="button" className={styles.clearFilters} onClick={clearFilters}>
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {showFullLoading ? (
        <div className={styles.stateBox}>
          <div>
            <p className={styles.stateTitle}>Cargando cupones…</p>
            <p className={styles.stateText}>Organizamos códigos, usos y vigencia de tus promociones.</p>
          </div>
        </div>
      ) : loadError ? (
        <div className={`${styles.stateBox} ${styles.stateError}`}>
          <div>
            <p className={styles.stateTitle}>No se pudo cargar</p>
            <p className={styles.stateText}>{loadError}</p>
          </div>
          <button type="button" className={styles.retryButton} onClick={() => void loadCoupons()}>
            <ReplayOutlinedIcon fontSize="small" aria-hidden />
            Reintentar
          </button>
        </div>
      ) : emptyAll ? (
        <div className={styles.empty}>
          <LocalOfferOutlinedIcon
            sx={{ fontSize: 36, color: 'var(--color-text-secondary)' }}
            aria-hidden
          />
          <h2 className={styles.emptyTitle}>Aún no hay cupones</h2>
          <p className={styles.emptyText}>
            Crea un código para que tus clientes lo usen al pagar en el menú en vivo.
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            style={{ marginTop: '1rem' }}
            onClick={openCreateDrawer}
            disabled={accessLoading || !selectedRestaurantId}
          >
            <AddOutlinedIcon fontSize="small" aria-hidden />
            Agregar cupón
          </button>
        </div>
      ) : emptySearch ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Sin coincidencias</h2>
          <p className={styles.emptyText}>Prueba otro código, nombre o quita los filtros.</p>
        </div>
      ) : (
        <>
          <p className={styles.counter}>
            {filtersActive
              ? hasMore
                ? `${visibleCoupons.length} coincidencias en los cupones cargados`
                : `${visibleCoupons.length} de ${stats.total} cupones`
              : hasMore
                ? `Mostrando ${visibleCoupons.length} cupones`
                : `${visibleCoupons.length} ${visibleCoupons.length === 1 ? 'cupón' : 'cupones'}`}
          </p>

          <div className={`${styles.tableWrap} ${loading ? styles.tableLoading : ''}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortHeader column="code" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Tipo</th>
                  <th>Beneficio</th>
                  <th>Alcance</th>
                  <SortHeader column="uses" sort={sort} order={order} align="right" onToggle={toggleSort} />
                  <SortHeader column="expiry" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Estado</th>
                  <th aria-label="Acciones">
                    <span className={styles.muted}>Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleCoupons.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className={styles.tableRow}
                    tabIndex={0}
                    aria-label={`Editar cupón ${coupon.code}`}
                    onClick={() => openEditDrawer(coupon)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openEditDrawer(coupon);
                      }
                    }}
                  >
                    <td>
                      <span className={styles.codeCell}>
                        <span>
                          <span className={styles.couponCode}>{coupon.code}</span>
                          <span className={styles.couponName}>{coupon.name}</span>
                        </span>
                        <Tooltip title={copiedCode === coupon.code ? 'Copiado' : 'Copiar código'}>
                          <IconButton
                            size="small"
                            aria-label={`Copiar código ${coupon.code}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyCode(coupon.code);
                            }}
                          >
                            <ContentCopyOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {copiedCode === coupon.code ? (
                          <span className={styles.copiedHint}>Copiado</span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <span className={styles.typeCell}>
                        <CouponTypeIcon type={coupon.type} />
                        {couponTypeLabel(coupon.type)}
                      </span>
                    </td>
                    <td>{couponBenefitLabel(coupon)}</td>
                    <td className={styles.muted}>{couponScopeLabel(coupon.scope)}</td>
                    <td className={styles.numeric}>
                      {couponStockLabel(coupon.redeemed_count, coupon.stock_qty)}
                    </td>
                    <td className={styles.muted}>{formatCouponExpiry(coupon.expires_on)}</td>
                    <td>
                      <span
                        className={`${styles.statusPill} ${statusPillClass(coupon.effective_status)}`}
                      >
                        {couponStatusLabel(coupon.effective_status ?? 'inactive')}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <div className={styles.actionsInner}>
                        <ActivePauseSwitch
                          checked={coupon.is_active}
                          pending={togglingIds.has(coupon.id)}
                          ariaLabel={
                            coupon.is_active
                              ? `Pausar cupón ${coupon.code}`
                              : `Reactivar cupón ${coupon.code}`
                          }
                          onChange={(next) => void handleToggleActive(coupon, next)}
                        />
                        <Tooltip title="Ver usos">
                          <IconButton
                            size="small"
                            aria-label={`Ver usos de ${coupon.code}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openClientsDrawer(coupon);
                            }}
                          >
                            <GroupsOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Editar">
                          <IconButton
                            size="small"
                            aria-label={`Editar ${coupon.code}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditDrawer(coupon);
                            }}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Eliminar ${coupon.code}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeletingCoupon(coupon);
                            }}
                          >
                            <DeleteOutlineOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </div>
                      {toggleErrors[coupon.id] ? (
                        <p className={styles.toggleError} role="alert">
                          {toggleErrors[coupon.id]}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${styles.cardList} ${loading ? styles.tableLoading : ''}`}>
            {visibleCoupons.map((coupon) => (
              <CouponListCard
                key={coupon.id}
                coupon={coupon}
                copied={copiedCode === coupon.code}
                statusClass={statusPillClass(coupon.effective_status)}
                toggling={togglingIds.has(coupon.id)}
                toggleError={toggleErrors[coupon.id] ?? null}
                onOpen={() => openEditDrawer(coupon)}
                onCopy={() => void copyCode(coupon.code)}
                onViewUses={() => openClientsDrawer(coupon)}
                onEdit={() => openEditDrawer(coupon)}
                onDelete={() => setDeletingCoupon(coupon)}
                onToggleActive={(next) => void handleToggleActive(coupon, next)}
              />
            ))}
          </div>

          {hasMore ? (
            <button
              type="button"
              className={styles.loadMore}
              disabled={loadingMore}
              onClick={() => void loadCoupons(nextCursor, true)}
            >
              {loadingMore ? 'Cargando…' : 'Cargar más cupones'}
            </button>
          ) : null}
        </>
      )}

      <CouponSheet
        open={drawerOpen}
        title={editingCoupon ? 'Editar cupón' : 'Nuevo cupón'}
        subtitle={
          editingCoupon
            ? 'Actualiza el beneficio, alcance o vigencia de este código.'
            : 'Configura el código que tus clientes usarán al pagar en el menú en vivo.'
        }
        onClose={closeDrawer}
      >
        <CouponForm
          key={editingCoupon?.id ?? 'create'}
          categories={categories}
          products={products}
          saving={saving}
          error={formError}
          mode={editingCoupon ? 'edit' : 'create'}
          initialValues={editingCoupon ? couponToFormValues(editingCoupon) : null}
          onCancel={closeDrawer}
          onSubmit={handleSubmit}
        />
      </CouponSheet>

      <CouponSheet
        open={clientsCoupon != null}
        title={clientsCoupon ? `Usos · ${clientsCoupon.code}` : 'Usos del cupón'}
        subtitle="Pedidos donde se aplicó este cupón."
        onClose={closeClientsDrawer}
      >
        {clientsCoupon && selectedRestaurantId && accessToken ? (
          <CouponApplicationsPanel
            key={clientsCoupon.id}
            accessToken={accessToken}
            restaurantId={selectedRestaurantId}
            couponId={clientsCoupon.id}
            couponCode={clientsCoupon.code}
            hideTitle
          />
        ) : null}
      </CouponSheet>

      <ConfirmDialog
        open={deletingCoupon != null}
        title="¿Eliminar cupón?"
        description={
          deletingCoupon
            ? `El código ${deletingCoupon.code} dejará de funcionar. Los pedidos ya confirmados conservan su descuento.`
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          if (!deleting) setDeletingCoupon(null);
        }}
      />
    </div>
  );
}
