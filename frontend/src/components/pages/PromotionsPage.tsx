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
  return (
    <th aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`${styles.sortBtn} ${active ? styles.sortBtnOn : ''}`}
        onClick={() => onToggle(column)}
      >
        <span>{label}</span>
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

  if (accessLoading) {
    return <div className={styles.page}>Cargando…</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Promociones</h1>
          <p className={styles.subtitle}>
            Crea descuentos, combos, ofertas N×M y beneficios por monto de carrito para tu menú digital.
          </p>
        </div>
        <div className={styles.metrics} aria-label="Resumen de promociones">
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.total}</span>
            <span className={styles.metricLabel}>Total</span>
          </div>
          <div className={styles.metricDivider} aria-hidden />
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.active}</span>
            <span className={styles.metricLabel}>Vigentes</span>
          </div>
          <div className={styles.metricDivider} aria-hidden />
          <div className={styles.metric}>
            <span className={styles.metricValue}>{stats.withBanner}</span>
            <span className={styles.metricLabel}>Con banner</span>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchField}>
          <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar promoción…"
            aria-label="Buscar promoción"
          />
        </div>
        <ToolbarSelect
          label="Estado"
          value={statusFilter}
          options={PROMOTION_STATUS_FILTER_LABELS}
          onChange={(value) => setStatusFilter(value as PromotionStatusFilter)}
        />
        <ToolbarSelect
          label="Tipo"
          value={templateFilter}
          options={PROMOTION_TEMPLATE_FILTER_LABELS}
          onChange={(value) => setTemplateFilter(value as PromotionTemplateFilter)}
        />
        {filtersActive ? (
          <button type="button" className={styles.clearFiltersBtn} onClick={clearFilters}>
            <CloseRoundedIcon fontSize="small" />
            Limpiar filtros
          </button>
        ) : null}
        <button type="button" className={styles.primaryBtn} onClick={openCreateSheet}>
          <AddOutlinedIcon fontSize="small" />
          Nueva promoción
        </button>
      </div>

      {loadError ? (
        <div className={styles.errorBanner} role="alert">
          <p>{loadError}</p>
          <button type="button" className={styles.secondaryBtn} onClick={() => void loadData()}>
            <ReplayOutlinedIcon fontSize="small" />
            Reintentar
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className={styles.helpText}>Cargando promociones…</p>
      ) : visiblePromotions.length === 0 ? (
        <div className={styles.emptyState}>
          <CampaignOutlinedIcon className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>
            {filtersActive ? 'Sin resultados' : 'Aún no hay promociones'}
          </h2>
          <p className={styles.emptyCopy}>
            {filtersActive
              ? 'Prueba con otros filtros o limpia la búsqueda.'
              : 'Crea tu primera promoción para mostrarla en el menú digital.'}
          </p>
          {!filtersActive ? (
            <button type="button" className={styles.primaryBtn} onClick={openCreateSheet}>
              <AddOutlinedIcon fontSize="small" />
              Nueva promoción
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortHeader column="name" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Tipo</th>
                  <th>Beneficio</th>
                  <th>Alcance</th>
                  <SortHeader column="status" sort={sort} order={order} onToggle={toggleSort} />
                  <th>Vigencia</th>
                  <th className={styles.actionsCol}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visiblePromotions.map((promotion) => {
                  const catalog = isCatalogPromotion(promotion);
                  return (
                    <tr key={promotion.id}>
                      <td>
                        <div className={styles.nameCell}>
                          <strong>{promotionDisplayName(promotion)}</strong>
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
                                onClick={() => openEditSheet(promotion)}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              aria-label="Eliminar promoción"
                              onClick={() => setDeletingPromotion(promotion)}
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
