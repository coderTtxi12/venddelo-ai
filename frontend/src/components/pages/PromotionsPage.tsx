'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import styles from './PromotionsPage.module.css';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { listCategories, listProducts } from '@/lib/api/menu';
import type { Category, Product, Promotion } from '@/lib/api/types';
import { deletePromotion, listAllPromotions } from '@/lib/api/promotions';
import {
  formatPromotionDateRange,
  promotionBenefitLabel,
  promotionDisplayName,
  promotionScopeLabel,
  promotionStatusLabel,
  promotionTypeLabel,
} from '@/lib/promotions/display';
import {
  computePromotionStats,
  filterPromotions,
  isCatalogPromotion,
  PROMOTION_MOBILE_SORT_OPTIONS,
  PROMOTION_SORT_COLUMN_LABELS,
  PROMOTION_STATUS_FILTER_LABELS,
  PROMOTION_TEMPLATE_FILTER_LABELS,
  promotionFiltersActive,
  sortPromotions,
  togglePromotionColumnSort,
  type PromotionListFilters,
  type PromotionSort,
  type PromotionSortOrder,
  type PromotionStatusFilter,
  type PromotionTemplateFilter,
} from '@/lib/promotions/filters';
import { mapPromotionToForm } from '@/lib/promotions/mapPromotionToForm';
import { persistPromotion } from '@/lib/promotions/persistPromotion';
import { templateFromPromotion, type PromotionTemplate } from '@/lib/promotions/templates';
import type { PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import PromotionSheet from '@/components/promotions/PromotionSheet';
import { PromotionListCard } from '@/components/promotions/PromotionListCard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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

function statusPillClass(status: Promotion['effective_status']): string {
  if (status === 'active') return styles.statusActive;
  if (status === 'expired') return styles.statusExpired;
  return styles.statusInactive;
}

function SortHeader({
  column,
  sort,
  order,
  onToggle,
}: {
  column: PromotionSort;
  sort: PromotionSort;
  order: PromotionSortOrder;
  onToggle: (column: PromotionSort) => void;
}) {
  const active = sort === column;
  const label = PROMOTION_SORT_COLUMN_LABELS[column];
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
        className={`${styles.sortBtn} ${active ? styles.sortBtnOn : ''}`}
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

export default function PromotionsPage() {
  const { accessToken } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [catalogPromotion, setCatalogPromotion] = useState<Promotion | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PromotionTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingPromotion, setDeletingPromotion] = useState<Promotion | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PromotionStatusFilter>('all');
  const [templateFilter, setTemplateFilter] = useState<PromotionTemplateFilter>('all');
  const [sort, setSort] = useState<PromotionSort>('created');
  const [order, setOrder] = useState<PromotionSortOrder>('desc');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const listFilters = useMemo<PromotionListFilters>(
    () => ({ query: debouncedQuery, status: statusFilter, template: templateFilter }),
    [debouncedQuery, statusFilter, templateFilter],
  );
  const filtersActive = promotionFiltersActive(listFilters);
  const stats = useMemo(() => computePromotionStats(promotions), [promotions]);
  const visiblePromotions = useMemo(() => {
    const filtered = filterPromotions(promotions, listFilters);
    return sortPromotions(filtered, sort, order);
  }, [promotions, listFilters, sort, order]);

  const loadData = useCallback(async () => {
    if (!selectedRestaurantId || !accessToken) {
      setPromotions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [promotionList, categoryList, productList] = await Promise.all([
        listAllPromotions(accessToken, selectedRestaurantId),
        loadAllCategories(accessToken, selectedRestaurantId),
        loadAllProducts(accessToken, selectedRestaurantId),
      ]);
      setPromotions(promotionList);
      setCategories(categoryList.filter((category) => category.is_active));
      setProducts(productList.filter((product) => product.status === 'active'));
      setHasLoaded(true);
    } catch (error) {
      console.error(error);
      setLoadError('No se pudieron cargar las promociones. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateSheet = () => {
    setEditingPromotion(null);
    setCatalogPromotion(null);
    setSelectedTemplate(null);
    setFormError(null);
    setSheetOpen(true);
  };

  const openEditSheet = (promotion: Promotion) => {
    setFormError(null);
    if (isCatalogPromotion(promotion)) {
      setEditingPromotion(null);
      setSelectedTemplate(null);
      setCatalogPromotion(promotion);
      setSheetOpen(true);
      return;
    }
    setCatalogPromotion(null);
    setEditingPromotion(promotion);
    setSelectedTemplate(templateFromPromotion(promotion));
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    setEditingPromotion(null);
    setCatalogPromotion(null);
    setSelectedTemplate(null);
  };

  const editFormValues = useMemo(
    () => (editingPromotion ? mapPromotionToForm(editingPromotion) : null),
    [editingPromotion],
  );

  const handleSubmit = async (payload: PromotionFormSubmitPayload) => {
    if (!selectedRestaurantId || !accessToken) return;
    setSaving(true);
    setFormError(null);
    try {
      const template =
        selectedTemplate ??
        (editingPromotion ? templateFromPromotion(editingPromotion) : 'product_discount');
      const saved = await persistPromotion(
        accessToken,
        selectedRestaurantId,
        payload,
        editingPromotion?.id,
        template,
      );
      setPromotions((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
      });
      closeSheet();
    } catch (error) {
      console.error(error);
      setFormError('No se pudo guardar la promoción. Revisa los datos e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPromotion || !selectedRestaurantId || !accessToken) return;
    setDeleting(true);
    try {
      await deletePromotion(accessToken, selectedRestaurantId, deletingPromotion.id);
      setPromotions((prev) => prev.filter((item) => item.id !== deletingPromotion.id));
      setDeletingPromotion(null);
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setDebouncedQuery('');
    setStatusFilter('all');
    setTemplateFilter('all');
  };

  const toggleSort = (column: PromotionSort) => {
    const next = togglePromotionColumnSort({ sort, order }, column);
    setSort(next.sort);
    setOrder(next.order);
  };

  const showFullLoading = loading && !hasLoaded;
  const emptyAll = hasLoaded && !loadError && stats.total === 0;
  const emptySearch = hasLoaded && !loadError && stats.total > 0 && visiblePromotions.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Promociones</h1>
          <p className={styles.subtitle}>
            Crea descuentos, combos, ofertas N×M y beneficios por monto de carrito para tu menú
            digital.
          </p>
        </div>
        <section className={styles.metrics} aria-label="Resumen de promociones">
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.total}</span>
            <span className={styles.metricLabel}>Total</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.active}</span>
            <span className={styles.metricLabel}>Vigentes</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.withBanner}</span>
            <span className={styles.metricLabel}>Con banner</span>
          </div>
        </section>
      </header>

      {!emptyAll ? (
        <>
          <div className={styles.toolbar}>
            <label className={styles.searchField} htmlFor="promotions-search">
              <span className={styles.searchLabel}>Buscar</span>
              <div className={`${styles.searchWrap} ${query ? styles.searchWrapActive : ''}`}>
                <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
                <input
                  id="promotions-search"
                  className={styles.searchInput}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nombre o tipo de promoción"
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
              onClick={openCreateSheet}
              disabled={accessLoading || !selectedRestaurantId}
            >
              <AddOutlinedIcon fontSize="small" aria-hidden />
              Nueva promoción
            </button>
          </div>

          <div className={styles.filters} role="group" aria-label="Filtros de promociones">
            <div className={styles.mobileSort}>
              <ToolbarSelect
                label="Ordenar"
                value={`${sort}:${order}`}
                options={PROMOTION_MOBILE_SORT_OPTIONS}
                onChange={(value) => {
                  const [nextSort, nextOrder] = value.split(':') as [
                    PromotionSort,
                    PromotionSortOrder,
                  ];
                  setSort(nextSort);
                  setOrder(nextOrder);
                }}
              />
            </div>
            <ToolbarSelect
              label="Estado"
              value={statusFilter}
              options={PROMOTION_STATUS_FILTER_LABELS}
              active={statusFilter !== 'all'}
              onChange={(value) => setStatusFilter(value as PromotionStatusFilter)}
            />
            <ToolbarSelect
              label="Tipo"
              value={templateFilter}
              options={PROMOTION_TEMPLATE_FILTER_LABELS}
              active={templateFilter !== 'all'}
              onChange={(value) => setTemplateFilter(value as PromotionTemplateFilter)}
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
            <p className={styles.stateTitle}>Cargando promociones…</p>
            <p className={styles.stateText}>
              Organizamos descuentos, combos y vigencia de tus ofertas.
            </p>
          </div>
        </div>
      ) : loadError ? (
        <div className={`${styles.stateBox} ${styles.stateError}`}>
          <div>
            <p className={styles.stateTitle}>No se pudo cargar</p>
            <p className={styles.stateText}>{loadError}</p>
          </div>
          <button type="button" className={styles.retryButton} onClick={() => void loadData()}>
            <ReplayOutlinedIcon fontSize="small" aria-hidden />
            Reintentar
          </button>
        </div>
      ) : emptyAll ? (
        <div className={styles.empty}>
          <CampaignOutlinedIcon
            sx={{ fontSize: 36, color: 'var(--color-text-secondary)' }}
            aria-hidden
          />
          <h2 className={styles.emptyTitle}>Aún no hay promociones</h2>
          <p className={styles.emptyText}>
            Crea tu primera promoción para mostrarla en el menú digital.
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            style={{ marginTop: '1rem' }}
            onClick={openCreateSheet}
            disabled={accessLoading || !selectedRestaurantId}
          >
            <AddOutlinedIcon fontSize="small" aria-hidden />
            Nueva promoción
          </button>
        </div>
      ) : emptySearch ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Sin coincidencias</h2>
          <p className={styles.emptyText}>Prueba otro nombre, tipo o quita los filtros.</p>
        </div>
      ) : (
        <>
          <p className={styles.counter}>
            {filtersActive
              ? `${visiblePromotions.length} de ${stats.total} promociones`
              : `${visiblePromotions.length} ${
                  visiblePromotions.length === 1 ? 'promoción' : 'promociones'
                }`}
          </p>

          <div className={`${styles.tableWrap} ${loading ? styles.tableLoading : ''}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortHeader column="name" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Tipo</th>
                  <th>Beneficio</th>
                  <th>Alcance</th>
                  <SortHeader column="status" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Vigencia</th>
                  <th aria-label="Acciones">
                    <span className={styles.muted}>Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePromotions.map((promotion) => {
                  const catalog = isCatalogPromotion(promotion);
                  const displayName = promotionDisplayName(promotion);
                  return (
                    <tr
                      key={promotion.id}
                      className={styles.tableRow}
                      tabIndex={0}
                      aria-label={`${catalog ? 'Ver' : 'Editar'} promoción ${displayName}`}
                      onClick={() => openEditSheet(promotion)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openEditSheet(promotion);
                        }
                      }}
                    >
                      <td>
                        <div className={styles.nameCell}>
                          <strong>{displayName}</strong>
                          {catalog ? <span className={styles.tag}>Desde producto</span> : null}
                        </div>
                      </td>
                      <td>{promotionTypeLabel(promotion)}</td>
                      <td>{promotionBenefitLabel(promotion)}</td>
                      <td>{promotionScopeLabel(promotion.scope)}</td>
                      <td>
                        <span
                          className={`${styles.statusPill} ${statusPillClass(promotion.effective_status)}`}
                        >
                          {promotionStatusLabel(promotion)}
                        </span>
                      </td>
                      <td>{formatPromotionDateRange(promotion.starts_at, promotion.ends_at)}</td>
                      <td>
                        <div className={styles.actionsInner}>
                          <Tooltip title={catalog ? 'Ver detalles' : 'Editar'}>
                            <span>
                              <IconButton
                                size="small"
                                aria-label={
                                  catalog ? 'Ver detalles de la promoción' : 'Editar promoción'
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditSheet(promotion);
                                }}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              aria-label="Eliminar promoción"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeletingPromotion(promotion);
                              }}
                            >
                              <DeleteOutlineOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList}>
            {visiblePromotions.map((promotion) => (
              <PromotionListCard
                key={promotion.id}
                promotion={promotion}
                onEdit={openEditSheet}
                onDelete={setDeletingPromotion}
              />
            ))}
          </div>
        </>
      )}

      <PromotionSheet
        open={sheetOpen}
        mode={editingPromotion ? 'edit' : 'create'}
        template={selectedTemplate}
        catalogPromotion={catalogPromotion}
        editingPromotionId={editingPromotion?.id ?? null}
        initialValues={editFormValues}
        restaurantId={selectedRestaurantId ?? ''}
        accessToken={accessToken ?? ''}
        categories={categories}
        products={products}
        saving={saving}
        error={formError}
        onClose={closeSheet}
        onTemplateSelect={setSelectedTemplate}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deletingPromotion != null}
        title="Eliminar promoción"
        description={
          deletingPromotion
            ? `¿Eliminar "${promotionDisplayName(deletingPromotion)}"? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={deleting}
        onCancel={() => setDeletingPromotion(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
