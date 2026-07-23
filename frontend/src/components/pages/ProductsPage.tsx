'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './ProductsPage.module.css';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import FilterListIcon from '@mui/icons-material/FilterList';
import Popover from '@mui/material/Popover';
import { legacyDb as db, legacyStorage as storage } from '@/services/legacyDb';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { getProductCount } from '@/lib/api/menu';
import { DEFAULT_CURRENCY, formatMoney } from '@/lib/currency';
import {
  cloneOptionGroupForProduct,
  listCopyableOptionGroups,
} from '@/lib/menu/copyableOptionGroups';
import { arrayMove } from '@/lib/arrayMove';
import { attachDragOverlay } from '@/lib/dragOverlay';
import type { Promotion } from '@/lib/api/types';
import {
  applyVisibilityStateToDraft,
  getProductVisibilityState,
  productVisibilityMeta,
  PRODUCT_VISIBILITY_OPTIONS,
  type ProductVisibilityState,
} from '@/lib/menu/productVisibility';
import { ProductVisibilitySelect } from '@/components/products/ProductVisibilitySelect';
import { ListPagination } from '@/components/ui/ListPagination';
import { paginateItems } from '@/lib/paginate';
import { normalizeSearchText, tokenizeQuery } from '@/lib/search/fuzzyMatch';
import { parseProductsPageFilter } from '@/lib/search/productsPageFilter';
import {
  CATEGORIES_PAGE_SIZE,
  fetchAllSupplierCategories,
  normalizeOptionGroups,
  PRODUCTS_PAGE_SIZE,
  fetchAllSupplierProducts,
  fetchSupplierProductDetail,
  fetchSupplierProductsPage,
  saveSupplierCategory,
  updateSupplierCategoryActive,
  saveSupplierProduct,
  updateSupplierProductVisibility,
  type CategoryDraft,
  type Id,
  type ImageDraft,
  type MoneyUSD,
  type OptionGroupDraft,
  type ProductDraft,
} from '@/services/db';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function money(amount: number): MoneyUSD {
  return { amount, currency: DEFAULT_CURRENCY };
}

function clampNumber(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Descuento efectivo en moneda; en modo % se calcula desde precio y porcentaje (solo UI). */
function effectiveProductDiscountUsd(
  mode: 'usd' | 'percent',
  price: number,
  discountUsd: number,
  discountPercent: number,
): number {
  const priceNorm = clampNumber(Number(price), 0, 1_000_000);
  if (mode === 'usd') {
    return clampNumber(Number(discountUsd), 0, priceNorm);
  }
  const pct = clampNumber(Number(discountPercent), 0, 100);
  const raw = priceNorm * (pct / 100);
  return clampNumber(raw, 0, priceNorm);
}

function productLineTotal(p: { price: { amount: number }; discountUsd: number }): number {
  const raw = p.price.amount - p.discountUsd;
  return raw > 0 ? raw : 0;
}
type ProductVisibilityFilter = ProductVisibilityState;

type CategoryActiveFilter = 'active' | 'inactive';

const CATEGORY_ACTIVE_FILTER_OPTIONS: { value: CategoryActiveFilter; label: string }[] = [
  { value: 'active', label: 'Activa' },
  { value: 'inactive', label: 'Inactiva' },
];

type ColumnSort = 'none' | 'asc' | 'desc';

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function reorderActiveGroups(groups: OptionGroupDraft[], from: number, to: number): OptionGroupDraft[] {
  const active = groups.filter((g) => g.isActive);
  const inactive = groups.filter((g) => !g.isActive);
  return [...arrayMove(active, from, to), ...inactive];
}

function reorderActiveItems(group: OptionGroupDraft, from: number, to: number): OptionGroupDraft {
  const active = group.items.filter((item) => item.isActive);
  const inactive = group.items.filter((item) => !item.isActive);
  return { ...group, items: [...arrayMove(active, from, to), ...inactive] };
}

/** none → asc; asc ↔ desc */
function cycleColumnSort(prev: ColumnSort): ColumnSort {
  if (prev === 'none') return 'asc';
  if (prev === 'asc') return 'desc';
  return 'asc';
}

function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

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
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </div>
    </div>
  );
}

function ImagePicker({
  value,
  onChange,
  helper,
  maxBytes,
}: {
  value: ImageDraft | null;
  onChange: (next: ImageDraft | null) => void;
  helper?: string;
  maxBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.imagePicker}>
      <div className={styles.imagePreview}>
        {value ? (
          <img src={value.previewUrl} alt="" className={styles.imagePreviewImg} />
        ) : (
          <div className={styles.imagePreviewEmpty}>Sin imagen</div>
        )}
      </div>
      <div className={styles.imagePickerActions}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (maxBytes != null && file.size > maxBytes) {
              const mb = (maxBytes / (1024 * 1024)).toFixed(0);
              setLocalError(`La imagen es muy pesada. Máximo permitido: ${mb} MB.`);
              if (inputRef.current) inputRef.current.value = '';
              return;
            }
            setLocalError(null);
            const previewUrl = URL.createObjectURL(file);
            if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
            onChange({ file, previewUrl });
          }}
        />
        <div className={styles.row}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => inputRef.current?.click()}
          >
            {value ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {value ? (
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                if (value.previewUrl) URL.revokeObjectURL(value.previewUrl);
                onChange(null);
                if (inputRef.current) inputRef.current.value = '';
                setLocalError(null);
              }}
            >
              Quitar
            </button>
          ) : null}
        </div>
        {helper ? <p className={styles.helpText}>{helper}</p> : null}
        {localError ? <p className={styles.errorInline}>{localError}</p> : null}
      </div>
    </div>
  );
}

function Pill({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'danger';
  title?: string;
}) {
  return (
    <span className={`${styles.pill} ${styles[`pill_${tone}`]}`} title={title}>
      {children}
    </span>
  );
}

function productMatchesNameQuery(name: string, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;
  const normalizedName = normalizeSearchText(name);
  return tokens.every((token) => normalizedName.includes(token));
}

function productMatchesCategoryActiveFilter(
  product: ProductDraft,
  statusFilter: CategoryActiveFilter[],
  categoryLookup: Map<Id, CategoryDraft>,
): boolean {
  if (statusFilter.length === 0) return true;
  const productCategories = product.categoryIds
    .map((id) => categoryLookup.get(id))
    .filter((category): category is CategoryDraft => Boolean(category));
  if (productCategories.length === 0) return false;
  return productCategories.some((category) =>
    statusFilter.includes(category.isActive ? 'active' : 'inactive'),
  );
}

function ProductCategoryChip({ category }: { category: CategoryDraft }) {
  const statusLabel = category.isActive ? 'Activa' : 'Inactiva';
  return (
    <span
      className={`${styles.categoryChip} ${category.isActive ? styles.categoryChipActive : styles.categoryChipInactive}`}
      title={`${category.name} · categoría ${statusLabel.toLowerCase()}`}
    >
      <span className={styles.categoryChipName}>{category.name}</span>
      <span
        className={`${styles.categoryChipStatus} ${category.isActive ? styles.categoryChipStatusActive : styles.categoryChipStatusInactive}`}
        aria-label={`Categoría ${statusLabel.toLowerCase()}`}
      >
        {statusLabel}
      </span>
    </span>
  );
}

function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div>
        <h3 className={styles.emptyTitle}>{title}</h3>
        <p className={styles.emptySubtitle}>{subtitle}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function CatalogLoadingState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className={styles.stateBox} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.loadingSpinner} aria-hidden />
      <p className={styles.stateTitle}>{title}</p>
      <p className={styles.stateText}>{subtitle}</p>
    </div>
  );
}

export default function ProductsPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const {
    loading: accessLoading,
    loadError: accessError,
    selectedRestaurantId: supplierId,
  } = useRestaurantAccess();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'categories' | 'products'>('products');

  // Categorías (todas las páginas; paginación en cliente)
  const [categories, setCategories] = useState<CategoryDraft[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoriesPage, setCategoriesPage] = useState(1);

  async function loadCategories() {
    if (!supplierId || !accessToken) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const items = await fetchAllSupplierCategories(accessToken, db, supplierId);
      setCategories(items);
      setCategoriesPage(1);
    } catch (e) {
      console.error(e);
      setCategoriesError('No se pudieron cargar las categorías. Intenta de nuevo.');
      setCategories([]);
      setCategoriesPage(1);
    } finally {
      setCategoriesLoading(false);
    }
  }

  // Productos (todas las páginas; paginación en cliente)
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalCount, setProductsTotalCount] = useState(0);
  const catalogPromotionsRef = useRef<Promotion[] | null>(null);
  const productsPageCacheRef = useRef<Map<number, ProductDraft[]>>(new Map());
  const productsPageCursorsRef = useRef<(string | null)[]>([null]);
  const productsFilterCatalogRef = useRef<ProductDraft[] | null>(null);
  const [productsFilterCatalogVersion, setProductsFilterCatalogVersion] = useState(0);
  const productsLoadRequestRef = useRef(0);

  const invalidateProductsPageCache = useCallback(() => {
    productsPageCacheRef.current.clear();
  }, []);

  const invalidateProductsFilterCatalog = useCallback(() => {
    productsFilterCatalogRef.current = null;
    setProductsFilterCatalogVersion((version) => version + 1);
  }, []);

  const markProductsFilterCatalogReady = useCallback((items: ProductDraft[]) => {
    productsFilterCatalogRef.current = items;
    setProductsFilterCatalogVersion((version) => version + 1);
  }, []);

  const resetProductsPagination = useCallback(() => {
    productsPageCacheRef.current.clear();
    productsPageCursorsRef.current = [null];
  }, []);

  const loadProductsTablePage = useCallback(
    async (page: number, options?: { force?: boolean }) => {
      if (!supplierId || !accessToken) return;

      const cached = productsPageCacheRef.current.get(page);
      if (cached && !options?.force) {
        setProducts(cached);
        setProductsPage(page);
        return;
      }

      const requestId = ++productsLoadRequestRef.current;
      setProductsLoading(true);
      setProductsError(null);
      try {
        const fetchPage = (pageNum: number, cursor: string | null) =>
          fetchSupplierProductsPage(
            accessToken,
            db,
            supplierId,
            { cursor },
            catalogPromotionsRef.current ?? undefined,
            { view: 'summary' },
          );

        let targetPage = page;
        let p = 1;
        while (p < targetPage) {
          if (productsPageCursorsRef.current[p] != null) {
            p += 1;
            continue;
          }
          const chainCursor = p === 1 ? null : (productsPageCursorsRef.current[p - 1] ?? null);
          if (p > 1 && chainCursor == null) {
            resetProductsPagination();
            targetPage = 1;
            break;
          }
          const chainResult = await fetchPage(p, chainCursor);
          if (requestId !== productsLoadRequestRef.current) return;
          productsPageCacheRef.current.set(p, chainResult.items);
          const chainCursors = productsPageCursorsRef.current.slice();
          while (chainCursors.length <= p) chainCursors.push(null);
          chainCursors[p] = chainResult.cursor;
          productsPageCursorsRef.current = chainCursors;
          p += 1;
        }

        if (targetPage > 1 && productsPageCursorsRef.current[targetPage - 1] == null) {
          targetPage = 1;
        }

        const cursor =
          targetPage === 1 ? null : (productsPageCursorsRef.current[targetPage - 1] ?? null);
        const [countResult, pageResult] = await Promise.all([
          targetPage === 1 ? getProductCount(accessToken, supplierId) : Promise.resolve(null),
          fetchPage(targetPage, cursor),
        ]);
        if (requestId !== productsLoadRequestRef.current) return;

        if (countResult) {
          setProductsTotalCount(countResult.total);
        }
        catalogPromotionsRef.current = pageResult.catalogPromotions;
        productsPageCacheRef.current.set(targetPage, pageResult.items);
        const nextCursors = productsPageCursorsRef.current.slice();
        while (nextCursors.length <= targetPage) nextCursors.push(null);
        nextCursors[targetPage] = pageResult.cursor;
        productsPageCursorsRef.current = nextCursors;
        setProducts(pageResult.items);
        setProductsPage(targetPage);
      } catch (e) {
        if (requestId !== productsLoadRequestRef.current) return;
        console.error(e);
        setProductsError('No se pudieron cargar los productos. Intenta de nuevo.');
        setProducts([]);
        setProductsPage(1);
      } finally {
        if (requestId === productsLoadRequestRef.current) {
          setProductsLoading(false);
        }
      }
    },
    [accessToken, resetProductsPagination, supplierId],
  );

  async function loadAllProductsForFilters() {
    if (!supplierId || !accessToken) return;

    const cached = productsFilterCatalogRef.current;
    if (cached) {
      setProducts(cached);
      setProductsTotalCount(cached.length);
      setProductsPage(1);
      return;
    }

    const requestId = productsLoadRequestRef.current;
    setProductsLoading(true);
    setProductsError(null);
    try {
      const result = await fetchAllSupplierProducts(accessToken, db, supplierId, { view: 'summary' });
      if (requestId !== productsLoadRequestRef.current) return;
      catalogPromotionsRef.current = result.catalogPromotions;
      markProductsFilterCatalogReady(result.items);
      setProducts(result.items);
      setProductsTotalCount(result.items.length);
      setProductsPage(1);
    } catch (e) {
      if (requestId !== productsLoadRequestRef.current) return;
      console.error(e);
      setProductsError('No se pudieron cargar los productos. Intenta de nuevo.');
      setProducts([]);
      setProductsPage(1);
    } finally {
      if (requestId === productsLoadRequestRef.current) {
        setProductsLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);

  const [categorySearch, setCategorySearch] = useState('');
  const [productNameFilter, setProductNameFilter] = useState('');
  const appliedProductsPageFilterRef = useRef<string | null>(null);

  useEffect(() => {
    const filter = parseProductsPageFilter(searchParams);
    if (!filter) return;

    const filterKey = `${filter.tab}:${filter.query}`;
    if (appliedProductsPageFilterRef.current === filterKey) return;
    appliedProductsPageFilterRef.current = filterKey;

    setActiveTab(filter.tab);
    if (filter.tab === 'categories') {
      setCategorySearch(filter.query);
    } else {
      setProductNameFilter(filter.query);
    }

    router.replace('/products', { scroll: false });
  }, [router, searchParams]);
  const [productCategoryFilterIds, setProductCategoryFilterIds] = useState<Id[]>([]);
  const [productCategoryActiveFilter, setProductCategoryActiveFilter] = useState<CategoryActiveFilter[]>([]);
  const [productPriceSort, setProductPriceSort] = useState<ColumnSort>('none');
  const [productDiscountSort, setProductDiscountSort] = useState<ColumnSort>('none');
  const [productTotalSort, setProductTotalSort] = useState<ColumnSort>('none');
  const [productVisibilityFilter, setProductVisibilityFilter] = useState<ProductVisibilityFilter[]>([]);
  const [productVisibilitySavingId, setProductVisibilitySavingId] = useState<Id | null>(null);
  const [productVisibilityError, setProductVisibilityError] = useState<string | null>(null);
  const [categoryActiveToggleId, setCategoryActiveToggleId] = useState<Id | null>(null);
  const [categoryActiveError, setCategoryActiveError] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const categoriesForProductFilters = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [categories]
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const productFiltersActive = useMemo(() => {
    return (
      productNameFilter.trim().length > 0 ||
      productCategoryFilterIds.length > 0 ||
      productCategoryActiveFilter.length > 0 ||
      productPriceSort !== 'none' ||
      productDiscountSort !== 'none' ||
      productTotalSort !== 'none' ||
      productVisibilityFilter.length > 0
    );
  }, [
    productNameFilter,
    productCategoryFilterIds,
    productCategoryActiveFilter,
    productPriceSort,
    productDiscountSort,
    productTotalSort,
    productVisibilityFilter,
  ]);

  const usesClientProductPagination = useMemo(
    () => productFiltersActive || productsFilterCatalogRef.current !== null,
    [productFiltersActive, productsFilterCatalogVersion],
  );

  const handleProductsPageChange = useCallback(
    (page: number) => {
      if (usesClientProductPagination) {
        setProductsPage(page);
        return;
      }
      void loadProductsTablePage(page);
    },
    [loadProductsTablePage, usesClientProductPagination],
  );

  useEffect(() => {
    invalidateProductsFilterCatalog();
  }, [invalidateProductsFilterCatalog, supplierId]);

  useEffect(() => {
    if (!supplierId || !accessToken) return;
    if (productFiltersActive) {
      productsLoadRequestRef.current += 1;
      void loadAllProductsForFilters();
      return;
    }
    if (productsFilterCatalogRef.current) {
      productsLoadRequestRef.current += 1;
      setProducts(productsFilterCatalogRef.current);
      setProductsTotalCount(productsFilterCatalogRef.current.length);
      setProductsPage(1);
      return;
    }
    productsLoadRequestRef.current += 1;
    resetProductsPagination();
    void loadProductsTablePage(1, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, accessToken, productFiltersActive]);

  const productsFilterCatalogPending =
    productFiltersActive && productsFilterCatalogRef.current === null && productsLoading;

  const displayedProducts = useMemo(() => {
    const catalogReady = productsFilterCatalogRef.current !== null;
    if (productFiltersActive && !catalogReady) {
      return [];
    }

    let rows = products;
    const nameQ = productNameFilter.trim();
    if (nameQ) {
      rows = rows.filter((p) => productMatchesNameQuery(p.name, nameQ));
    }
    if (productCategoryFilterIds.length > 0) {
      rows = rows.filter((p) => p.categoryIds.some((id) => productCategoryFilterIds.includes(id)));
    }
    if (productCategoryActiveFilter.length > 0) {
      rows = rows.filter((p) =>
        productMatchesCategoryActiveFilter(p, productCategoryActiveFilter, categoryById),
      );
    }
    if (productVisibilityFilter.length > 0) {
      rows = rows.filter((p) => productVisibilityFilter.includes(getProductVisibilityState(p)));
    }
    rows = [...rows].sort((a, b) => {
      if (productPriceSort !== 'none') {
        const d =
          productPriceSort === 'asc' ? a.price.amount - b.price.amount : b.price.amount - a.price.amount;
        if (d !== 0) return d;
      }
      if (productDiscountSort !== 'none') {
        const d =
          productDiscountSort === 'asc'
            ? a.discountUsd - b.discountUsd
            : b.discountUsd - a.discountUsd;
        if (d !== 0) return d;
      }
      if (productTotalSort !== 'none') {
        const ta = productLineTotal(a);
        const tb = productLineTotal(b);
        const d = productTotalSort === 'asc' ? ta - tb : tb - ta;
        if (d !== 0) return d;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return rows;
  }, [
    products,
    productNameFilter,
    productCategoryFilterIds,
    productCategoryActiveFilter,
    categoryById,
    productVisibilityFilter,
    productPriceSort,
    productDiscountSort,
    productTotalSort,
    productFiltersActive,
    productsFilterCatalogVersion,
  ]);

  const paginatedCategories = useMemo(
    () => paginateItems(filteredCategories, categoriesPage, CATEGORIES_PAGE_SIZE),
    [filteredCategories, categoriesPage],
  );

  const paginatedProducts = useMemo(() => {
    if (usesClientProductPagination) {
      return paginateItems(displayedProducts, productsPage, PRODUCTS_PAGE_SIZE);
    }
    const totalPages = Math.max(1, Math.ceil(productsTotalCount / PRODUCTS_PAGE_SIZE));
    const rangeStart =
      productsTotalCount === 0 ? 0 : (productsPage - 1) * PRODUCTS_PAGE_SIZE + 1;
    const rangeEnd = Math.min(productsPage * PRODUCTS_PAGE_SIZE, productsTotalCount);
    return {
      items: products,
      page: productsPage,
      totalPages,
      totalItems: productsTotalCount,
      rangeStart,
      rangeEnd,
    };
  }, [displayedProducts, products, productsPage, productsTotalCount, usesClientProductPagination]);

  useEffect(() => {
    setCategoriesPage(1);
  }, [categorySearch]);

  useEffect(() => {
    setProductsPage(1);
  }, [
    productNameFilter,
    productCategoryFilterIds,
    productCategoryActiveFilter,
    productPriceSort,
    productDiscountSort,
    productTotalSort,
    productVisibilityFilter,
  ]);

  function clearProductTableFilters() {
    setProductNameFilter('');
    setProductCategoryFilterIds([]);
    setProductCategoryActiveFilter([]);
    setProductPriceSort('none');
    setProductDiscountSort('none');
    setProductTotalSort('none');
    setProductVisibilityFilter([]);
  }

  const [categoryFilterAnchor, setCategoryFilterAnchor] = useState<HTMLElement | null>(null);
  const [statusFilterAnchor, setStatusFilterAnchor] = useState<HTMLElement | null>(null);

  const selectedCategoryLabels = useMemo(() => {
    return productCategoryFilterIds
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
  }, [productCategoryFilterIds, categories]);

  const selectedStatusTags = useMemo(() => {
    return productVisibilityFilter.map((state) => {
      const option = PRODUCT_VISIBILITY_OPTIONS.find((entry) => entry.value === state);
      return { key: `v:${state}`, label: option?.label ?? state };
    });
  }, [productVisibilityFilter]);

  const selectedCategoryStatusTags = useMemo(() => {
    return productCategoryActiveFilter.map((status) => {
      const option = CATEGORY_ACTIVE_FILTER_OPTIONS.find((entry) => entry.value === status);
      return { key: `c:${status}`, label: option?.label ?? status };
    });
  }, [productCategoryActiveFilter]);

  function removeCategoryStatusFilter(key: string) {
    const status = key.replace(/^c:/, '') as CategoryActiveFilter;
    setProductCategoryActiveFilter((prev) => prev.filter((value) => value !== status));
  }

  function removeCategoryFilter(id: Id) {
    setProductCategoryFilterIds((prev) => prev.filter((x) => x !== id));
  }

  function removeStatusTag(key: string) {
    const state = key.replace(/^v:/, '') as ProductVisibilityState;
    setProductVisibilityFilter((prev) => prev.filter((value) => value !== state));
  }

  async function handleProductVisibilityChange(productId: Id, nextState: ProductVisibilityState) {
    if (!supplierId || !accessToken) return;
    const current = products.find((product) => product.id === productId);
    if (!current || getProductVisibilityState(current) === nextState) return;

    setProductVisibilitySavingId(productId);
    setProductVisibilityError(null);
    try {
      await updateSupplierProductVisibility(accessToken, db, supplierId, productId, nextState);
      setProducts((prev) => {
        const next = prev.map((product) =>
          product.id === productId ? applyVisibilityStateToDraft(product, nextState) : product,
        );
        if (productFiltersActive) {
          productsFilterCatalogRef.current = next;
        } else {
          invalidateProductsFilterCatalog();
        }
        return next;
      });
    } catch (err) {
      console.error(err);
      setProductVisibilityError('No se pudo cambiar el estado del producto. Intenta de nuevo.');
    } finally {
      setProductVisibilitySavingId(null);
    }
  }

  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<Id | null>(null);

  const categoryDraft = useMemo(() => {
    if (!editingCategoryId) return null;
    return categories.find((c) => c.id === editingCategoryId) ?? null;
  }, [categories, editingCategoryId]);

  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<Id | null>(null);
  const [editingProductDraft, setEditingProductDraft] = useState<ProductDraft | null>(null);
  const [editingProductLoading, setEditingProductLoading] = useState(false);
  const [copySourceProducts, setCopySourceProducts] = useState<ProductDraft[] | null>(null);

  const productDraft = editingProductId ? editingProductDraft : null;

  function openNewCategory() {
    setEditingCategoryId(null);
    setCategoryDrawerOpen(true);
  }

  function openEditCategory(id: Id) {
    setEditingCategoryId(id);
    setCategoryDrawerOpen(true);
  }

  const inactiveCategoriesForEditor = useMemo(() => {
    if (!editingProductId) return [];
    return categories
      .filter((category) => !category.isActive)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [categories, editingProductId]);

  function openNewProduct() {
    setEditingProductId(null);
    setEditingProductDraft(null);
    setProductDrawerOpen(true);
  }

  function openEditProduct(id: Id) {
    setEditingProductId(id);
    setEditingProductDraft(null);
    setProductDrawerOpen(true);
    if (!supplierId || !accessToken) return;
    setEditingProductLoading(true);
    void fetchSupplierProductDetail(
      accessToken,
      supplierId,
      id,
      catalogPromotionsRef.current ?? undefined,
    )
      .then((detail) => {
        setEditingProductDraft(detail);
      })
      .catch((error) => {
        console.error(error);
        setProductsError('No se pudo cargar el detalle del producto.');
        setProductDrawerOpen(false);
        setEditingProductId(null);
      })
      .finally(() => {
        setEditingProductLoading(false);
      });
  }

  useEffect(() => {
    if (!productDrawerOpen || !supplierId || !accessToken || copySourceProducts) return;
    let cancelled = false;
    void fetchAllSupplierProducts(accessToken, db, supplierId, { view: 'full' })
      .then((result) => {
        if (!cancelled) {
          setCopySourceProducts(result.items);
        }
      })
      .catch((error) => {
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [productDrawerOpen, supplierId, accessToken, copySourceProducts]);

  useEffect(() => {
    if (!productDrawerOpen) {
      setCopySourceProducts(null);
    }
  }, [productDrawerOpen]);

  const supplierPending = Boolean(
    !authLoading && !accessLoading && accessToken && !supplierId && !accessError,
  );

  const categoriesTabLoading = authLoading || accessLoading || supplierPending || categoriesLoading;
  const productsTabLoading =
    authLoading ||
    accessLoading ||
    supplierPending ||
    (productsLoading && products.length === 0);

  const catalogLoadingTitle = supplierPending
    ? 'Conectando con tu restaurante…'
    : activeTab === 'categories'
      ? 'Cargando categorías…'
      : 'Cargando productos…';

  const catalogLoadingSubtitle = supplierPending
    ? 'Preparando tu catálogo.'
    : activeTab === 'categories'
      ? 'Organizando las secciones de tu menú.'
      : 'Preparando tu catálogo de productos.';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Productos</h1>
          <p className={styles.subtitle}>
            Administra tus categorías y productos. Cambia el estado en la columna <strong>Estado</strong>{' '}
            para controlar si un producto aparece en el menú público.
          </p>
        </div>
        <div className={styles.headerActions}>
          {activeTab === 'categories' ? (
            <button type="button" className={styles.primaryBtn} onClick={openNewCategory}>
              + Nueva categoría
            </button>
          ) : (
            <button type="button" className={styles.primaryBtn} onClick={openNewProduct} disabled={activeCategories.length === 0}>
              + Nuevo producto
            </button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'products' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Productos
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'categories' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categorías
        </button>
      </div>

      {activeTab === 'categories' ? (
        <section className={styles.section}>
          {categoriesTabLoading ? (
            <CatalogLoadingState title={catalogLoadingTitle} subtitle={catalogLoadingSubtitle} />
          ) : (
            <>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <input
                className={styles.searchInput}
                placeholder="Buscar categorías…"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
              />
            </div>
            <div className={styles.toolbarRight}>
              <span className={styles.counter}>{filteredCategories.length} categorías</span>
            </div>
          </div>

          {categories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              subtitle="Crea al menos una categoría antes de agregar productos."
              action={
                <button type="button" className={styles.primaryBtn} onClick={openNewCategory}>
                  + Nueva categoría
                </button>
              }
            />
          ) : (
            <div className={styles.grid}>
              {paginatedCategories.items.map((c) => (
                <div
                  key={c.id}
                  className={`${styles.card} ${styles.categoryCard} ${styles.clickableCard} ${c.isActive ? '' : styles.cardInactive}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditCategory(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEditCategory(c.id);
                    }
                  }}
                >
                  <div className={styles.categoryStatusPillAnchor}>
                    <Pill tone={c.isActive ? 'success' : 'neutral'}>
                      {c.isActive ? 'Activa' : 'Inactiva'}
                    </Pill>
                  </div>
                  <div className={styles.cardTop}>
                    <div className={styles.cardImage}>
                      {c.image ? <img src={c.image.previewUrl} alt="" /> : <div className={styles.cardImageEmpty}>No image</div>}
                    </div>
                    <div className={styles.cardMeta}>
                      <div className={styles.cardTitleRow}>
                        <h3 className={styles.cardTitle}>{c.name}</h3>
                      </div>
                      <p className={styles.cardDesc}>{c.description || '—'}</p>
                      <p className={styles.cardHint}>
                        Actualizado {new Date(c.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    {c.isActive ? (
                      <button
                        type="button"
                        className={styles.dangerGhostBtn}
                        disabled={categoryActiveToggleId === c.id || !supplierId}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!supplierId || !accessToken) return;
                          void (async () => {
                            setCategoryActiveError(null);
                            setCategoryActiveToggleId(c.id);
                            try {
                              await updateSupplierCategoryActive(accessToken, db, supplierId, c.id, false);
                              setCategories((prev) =>
                                prev.map((x) =>
                                  x.id === c.id ? { ...x, isActive: false, updatedAt: nowIso() } : x
                                )
                              );
                            } catch (err) {
                              console.error(err);
                              setCategoryActiveError(
                                'No se pudo desactivar la categoría. Intenta de nuevo.'
                              );
                            } finally {
                              setCategoryActiveToggleId(null);
                            }
                          })();
                        }}
                      >
                        {categoryActiveToggleId === c.id ? 'Guardando…' : 'Desactivar'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={categoryActiveToggleId === c.id || !supplierId}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!supplierId || !accessToken) return;
                          void (async () => {
                            setCategoryActiveError(null);
                            setCategoryActiveToggleId(c.id);
                            try {
                              await updateSupplierCategoryActive(accessToken, db, supplierId, c.id, true);
                              setCategories((prev) =>
                                prev.map((x) =>
                                  x.id === c.id ? { ...x, isActive: true, updatedAt: nowIso() } : x
                                )
                              );
                            } catch (err) {
                              console.error(err);
                              setCategoryActiveError(
                                'No se pudo activar la categoría. Intenta de nuevo.'
                              );
                            } finally {
                              setCategoryActiveToggleId(null);
                            }
                          })();
                        }}
                      >
                        {categoryActiveToggleId === c.id ? 'Guardando…' : 'Activar'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {categoriesError ? (
            <div className={styles.errorBanner} role="alert">{categoriesError}</div>
          ) : null}
          {categoryActiveError ? (
            <div className={styles.errorBanner} role="alert">{categoryActiveError}</div>
          ) : null}

          {!categoriesLoading ? (
            <ListPagination
              page={paginatedCategories.page}
              totalPages={paginatedCategories.totalPages}
              totalItems={paginatedCategories.totalItems}
              rangeStart={paginatedCategories.rangeStart}
              rangeEnd={paginatedCategories.rangeEnd}
              pageSize={CATEGORIES_PAGE_SIZE}
              itemLabel="categorías"
              onPageChange={setCategoriesPage}
            />
          ) : null}

          <Drawer
            open={categoryDrawerOpen}
            title={editingCategoryId ? 'Editar categoría' : 'Nueva categoría'}
            onClose={() => setCategoryDrawerOpen(false)}
          >
            <CategoryEditor
              initial={categoryDraft}
              onCancel={() => setCategoryDrawerOpen(false)}
              supplierId={supplierId}
              supplierIdError={accessError}
              onSave={async (payload) => {
                if (!supplierId || !accessToken) {
                  throw new Error(accessError ?? 'No hay sesión o restaurante disponible.');
                }
                await saveSupplierCategory(accessToken, db, storage, supplierId, payload);
                await loadCategories();
                setCategoryDrawerOpen(false);
              }}
            />
          </Drawer>
            </>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          {productsTabLoading ? (
            <CatalogLoadingState title={catalogLoadingTitle} subtitle={catalogLoadingSubtitle} />
          ) : activeCategories.length === 0 ? (
            <EmptyState
              title="Primero crea una categoría"
              subtitle="Cada producto debe pertenecer al menos a una categoría."
              action={
                <button type="button" className={styles.primaryBtn} onClick={() => {
                  setActiveTab('categories');
                  openNewCategory();
                }}>
                  + Nueva categoría
                </button>
              }
            />
          ) : (
            <>
              <div className={styles.toolbar}>
                <div className={styles.search}>
                  <input
                    className={styles.searchInput}
                    placeholder="Buscar productos por nombre…"
                    value={productNameFilter}
                    onChange={(e) => setProductNameFilter(e.target.value)}
                    type="search"
                    autoComplete="off"
                  />
                </div>
                <div className={styles.toolbarRight}>
                  {productFiltersActive ? (
                    <button type="button" className={styles.ghostBtn} onClick={clearProductTableFilters}>
                      Restablecer filtros
                    </button>
                  ) : null}
                  <span className={styles.counter}>
                    {displayedProducts.length === products.length
                      ? `${products.length} productos`
                      : `${displayedProducts.length} de ${products.length} productos`}
                  </span>
                </div>
              </div>

              {products.length === 0 ? (
                <EmptyState
                  title="Aún no hay productos"
                  subtitle="Crea tu primer producto para empezar a vender en el marketplace móvil."
                  action={
                    <button type="button" className={styles.primaryBtn} onClick={openNewProduct}>
                      + Nuevo producto
                    </button>
                  }
                />
              ) : (
                <div className={styles.tableWrap}>
                  {productVisibilityError ? (
                    <div className={styles.errorBanner} role="alert">{productVisibilityError}</div>
                  ) : null}
                  <ProductMobileControls
                    categories={categories}
                    productCategoryFilterIds={productCategoryFilterIds}
                    productCategoryActiveFilter={productCategoryActiveFilter}
                    productVisibilityFilter={productVisibilityFilter}
                    productPriceSort={productPriceSort}
                    setProductPriceSort={setProductPriceSort}
                    productDiscountSort={productDiscountSort}
                    setProductDiscountSort={setProductDiscountSort}
                    productTotalSort={productTotalSort}
                    setProductTotalSort={setProductTotalSort}
                    categoryFilterAnchor={categoryFilterAnchor}
                    setCategoryFilterAnchor={setCategoryFilterAnchor}
                    statusFilterAnchor={statusFilterAnchor}
                    setStatusFilterAnchor={setStatusFilterAnchor}
                    selectedStatusTags={selectedStatusTags}
                    selectedCategoryStatusTags={selectedCategoryStatusTags}
                    removeCategoryFilter={removeCategoryFilter}
                    removeCategoryStatusFilter={removeCategoryStatusFilter}
                    removeStatusTag={removeStatusTag}
                    productFiltersActive={productFiltersActive}
                    onClearFilters={clearProductTableFilters}
                  />
                  <table className={styles.table}>
                    <thead>
                      <tr className={styles.headerLabelRow}>
                        <th className={styles.thDashboard}>Producto</th>
                        <th className={`${styles.thDashboard} ${styles.thFilterColumn}`}>
                          <div className={styles.thFilterHead}>
                            <button
                              type="button"
                              className={styles.thFilterTitleBtn}
                              aria-expanded={Boolean(categoryFilterAnchor)}
                              aria-haspopup="dialog"
                              onClick={(e) => {
                                setStatusFilterAnchor(null);
                                setCategoryFilterAnchor(categoryFilterAnchor ? null : e.currentTarget);
                              }}
                            >
                              Categorías
                            </button>
                            <button
                              type="button"
                              className={styles.thFilterIconBtn}
                              aria-label="Filtrar por categoría"
                              onClick={(e) => {
                                setStatusFilterAnchor(null);
                                setCategoryFilterAnchor(categoryFilterAnchor ? null : e.currentTarget);
                              }}
                            >
                              <FilterListIcon sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          {(selectedCategoryLabels.length > 0 || selectedCategoryStatusTags.length > 0) ? (
                            <div className={styles.thHeaderBadges}>
                              {selectedCategoryStatusTags.map((tag) => (
                                <span key={tag.key} className={styles.thHeaderBadge}>
                                  <span className={styles.thHeaderBadgeText}>{tag.label}</span>
                                  <button
                                    type="button"
                                    className={styles.thHeaderBadgeRemove}
                                    aria-label={`Quitar filtro ${tag.label}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeCategoryStatusFilter(tag.key);
                                    }}
                                  >
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                  </button>
                                </span>
                              ))}
                              {productCategoryFilterIds.map((id) => {
                                const name = categories.find((c) => c.id === id)?.name ?? id;
                                return (
                                  <span key={id} className={styles.thHeaderBadge}>
                                    <span className={styles.thHeaderBadgeText}>{name}</span>
                                    <button
                                      type="button"
                                      className={styles.thHeaderBadgeRemove}
                                      aria-label={`Quitar filtro ${name}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeCategoryFilter(id);
                                      }}
                                    >
                                      <CloseIcon sx={{ fontSize: 14 }} />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </th>
                        <th className={styles.thDashboard}>
                          <button
                            type="button"
                            className={styles.thSortLabelBtn}
                            aria-label={
                              productPriceSort === 'none'
                                ? 'Ordenar precio: activar ascendente'
                                : productPriceSort === 'asc'
                                  ? 'Precio orden ascendente; clic para descendente'
                                  : 'Precio orden descendente; clic para ascendente'
                            }
                            onClick={() => setProductPriceSort((s) => cycleColumnSort(s))}
                          >
                            <span>Precio</span>
                            <span className={styles.thSortDir} aria-hidden>
                              <span
                                className={
                                  productPriceSort === 'asc'
                                    ? styles.thSortDirActive
                                    : styles.thSortDirIdle
                                }
                              >
                                ↑
                              </span>
                              <span
                                className={
                                  productPriceSort === 'desc'
                                    ? styles.thSortDirActive
                                    : styles.thSortDirIdle
                                }
                              >
                                ↓
                              </span>
                            </span>
                          </button>
                        </th>
                        <th className={styles.thDashboard}>
                          <button
                            type="button"
                            className={styles.thSortLabelBtn}
                            aria-label={
                              productDiscountSort === 'none'
                                ? 'Ordenar descuento: activar ascendente'
                                : productDiscountSort === 'asc'
                                  ? 'Descuento orden ascendente; clic para descendente'
                                  : 'Descuento orden descendente; clic para ascendente'
                            }
                            onClick={() => setProductDiscountSort((s) => cycleColumnSort(s))}
                          >
                            <span>Descuento</span>
                            <span className={styles.thSortDir} aria-hidden>
                              <span
                                className={
                                  productDiscountSort === 'asc'
                                    ? styles.thSortDirActive
                                    : styles.thSortDirIdle
                                }
                              >
                                ↑
                              </span>
                              <span
                                className={
                                  productDiscountSort === 'desc'
                                    ? styles.thSortDirActive
                                    : styles.thSortDirIdle
                                }
                              >
                                ↓
                              </span>
                            </span>
                          </button>
                        </th>
                        <th className={styles.thDashboard}>
                          <button
                            type="button"
                            className={styles.thSortLabelBtn}
                            aria-label={
                              productTotalSort === 'none'
                                ? 'Ordenar total: activar ascendente'
                                : productTotalSort === 'asc'
                                  ? 'Total orden ascendente; clic para descendente'
                                  : 'Total orden descendente; clic para ascendente'
                            }
                            onClick={() => setProductTotalSort((s) => cycleColumnSort(s))}
                          >
                            <span>Total</span>
                            <span className={styles.thSortDir} aria-hidden>
                              <span
                                className={
                                  productTotalSort === 'asc'
                                    ? styles.thSortDirActive
                                    : styles.thSortDirIdle
                                }
                              >
                                ↑
                              </span>
                              <span
                                className={
                                  productTotalSort === 'desc'
                                    ? styles.thSortDirActive
                                    : styles.thSortDirIdle
                                }
                              >
                                ↓
                              </span>
                            </span>
                          </button>
                        </th>
                        <th className={`${styles.thDashboard} ${styles.thFilterColumn}`}>
                          <div className={styles.thFilterHead}>
                            <button
                              type="button"
                              className={styles.thFilterTitleBtn}
                              aria-expanded={Boolean(statusFilterAnchor)}
                              aria-haspopup="dialog"
                              onClick={(e) => {
                                setCategoryFilterAnchor(null);
                                setStatusFilterAnchor(statusFilterAnchor ? null : e.currentTarget);
                              }}
                            >
                              Estado
                            </button>
                            <button
                              type="button"
                              className={styles.thFilterIconBtn}
                              aria-label="Filtrar por estado"
                              onClick={(e) => {
                                setCategoryFilterAnchor(null);
                                setStatusFilterAnchor(statusFilterAnchor ? null : e.currentTarget);
                              }}
                            >
                              <FilterListIcon sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          {selectedStatusTags.length > 0 ? (
                            <div className={styles.thHeaderBadges}>
                              {selectedStatusTags.map((t) => (
                                <span key={t.key} className={styles.thHeaderBadge}>
                                  <span className={styles.thHeaderBadgeText}>{t.label}</span>
                                  <button
                                    type="button"
                                    className={styles.thHeaderBadgeRemove}
                                    aria-label={`Quitar filtro ${t.label}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeStatusTag(t.key);
                                    }}
                                  >
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} className={styles.filterNoResults}>
                            <div className={styles.filterNoResultsInner}>
                              {productsFilterCatalogPending ? (
                                <p>Buscando productos…</p>
                              ) : (
                                <>
                                  <p>Ningún producto coincide con los filtros actuales.</p>
                                  {productFiltersActive ? (
                                    <button type="button" className={styles.secondaryBtn} onClick={clearProductTableFilters}>
                                      Limpiar filtros
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {paginatedProducts.items.map((p) => {
                        const productCategories = p.categoryIds
                          .map((id) => categoryById.get(id))
                          .filter((category): category is CategoryDraft => Boolean(category));
                        return (
                          <tr
                            key={p.id}
                            className={`${styles.rowHover} ${styles.clickableRow} ${p.status !== 'inactive' ? '' : styles.rowInactive}`}
                            tabIndex={0}
                            onClick={() => openEditProduct(p.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openEditProduct(p.id);
                              }
                            }}
                          >
                            <td className={styles.productPrimaryCell}>
                              <div className={styles.productCell}>
                                <div className={styles.productThumb}>
                                  {p.image ? <img src={p.image.previewUrl} alt="" /> : <div className={styles.thumbEmpty}>Sin imagen</div>}
                                </div>
                                <div className={styles.productMeta}>
                                  <div className={styles.productName}>{p.name}</div>
                                  <div className={styles.productDesc}>{p.description || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td className={`${styles.labeledCell} ${styles.categoryCell}`} data-label="Categorías">
                              <div className={styles.chips}>
                                {productCategories.length > 0 ? (
                                  productCategories.map((category) => (
                                    <ProductCategoryChip key={category.id} category={category} />
                                  ))
                                ) : (
                                  <span className={styles.muted}>—</span>
                                )}
                              </div>
                            </td>
                            <td className={`${styles.labeledCell} ${styles.priceCell}`} data-label="Precio">
                              {formatMoney(p.price.amount, p.price.currency)}
                            </td>
                            <td className={`${styles.labeledCell} ${styles.priceCell} ${styles.discountCell}`} data-label="Descuento">
                              {p.discountUsd > 0 ? `-${formatMoney(p.discountUsd, p.price.currency)}` : '—'}
                            </td>
                            <td className={`${styles.labeledCell} ${styles.priceCell} ${styles.totalCell}`} data-label="Total">
                              {formatMoney(productLineTotal(p), p.price.currency)}
                            </td>
                            <td
                              className={`${styles.labeledCell} ${styles.statusCell}`}
                              data-label="Estado"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ProductVisibilitySelect
                                product={p}
                                className={styles.productStatusSelect}
                                saving={productVisibilitySavingId === p.id}
                                disabled={!supplierId || !accessToken}
                                onChange={(nextState) => {
                                  void handleProductVisibilityChange(p.id, nextState);
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Popover
                    open={Boolean(categoryFilterAnchor)}
                    anchorEl={categoryFilterAnchor}
                    onClose={() => setCategoryFilterAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                    slotProps={{
                      paper: {
                        className: styles.filterMuiPaper,
                      },
                    }}
                  >
                    <div className={styles.filterPopoverBody}>
                      <p className={styles.filterPopoverTitle}>Estado de categoría</p>
                      <div className={styles.filterPopoverChips} role="group" aria-label="Estado de categoría">
                        {CATEGORY_ACTIVE_FILTER_OPTIONS.map(({ value, label }) => {
                          const on = productCategoryActiveFilter.includes(value);
                          return (
                            <button
                              key={value}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              className={`${styles.filterChip} ${on ? styles.filterChipOn : ''} ${
                                value === 'active' ? styles.filterChipCategoryActiveTone : styles.filterChipCategoryInactiveTone
                              }`}
                              onClick={() =>
                                setProductCategoryActiveFilter((prev) => toggleInList(prev, value))
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className={styles.filterPopoverTitle}>Categorías</p>
                      <p className={styles.filterPopoverHelp}>
                        Selecciona una o varias. El producto debe pertenecer al menos a una.
                      </p>
                      <div className={styles.filterPopoverChips} role="group" aria-label="Categorías">
                        {categoriesForProductFilters.length === 0 ? (
                          <span className={styles.filterEmpty}>Sin categorías cargadas</span>
                        ) : (
                          categoriesForProductFilters.map((c) => {
                            const on = productCategoryFilterIds.includes(c.id);
                            const statusLabel = c.isActive ? 'Activa' : 'Inactiva';
                            return (
                              <button
                                key={c.id}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={`${c.name} (${statusLabel})`}
                                className={`${styles.filterCategoryChip} ${on ? styles.filterCategoryChipOn : ''} ${
                                  c.isActive ? styles.filterCategoryChipActive : styles.filterCategoryChipInactive
                                }`}
                                onClick={() =>
                                  setProductCategoryFilterIds((prev) => toggleInList(prev, c.id))
                                }
                              >
                                <span className={styles.filterCategoryChipName}>{c.name}</span>
                                <span
                                  className={`${styles.filterCategoryChipStatus} ${
                                    c.isActive
                                      ? styles.filterCategoryChipStatusActive
                                      : styles.filterCategoryChipStatusInactive
                                  }`}
                                >
                                  {statusLabel}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </Popover>
                  <Popover
                    open={Boolean(statusFilterAnchor)}
                    anchorEl={statusFilterAnchor}
                    onClose={() => setStatusFilterAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                    slotProps={{
                      paper: {
                        className: styles.filterMuiPaper,
                      },
                    }}
                  >
                    <div className={styles.filterPopoverBody}>
                      <p className={styles.filterPopoverTitle}>Estado en menú</p>
                      <div className={styles.filterPopoverChips} role="group" aria-label="Estado del producto">
                        {PRODUCT_VISIBILITY_OPTIONS.map(({ value, label }) => {
                          const on = productVisibilityFilter.includes(value);
                          return (
                            <button
                              key={value}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              className={`${styles.filterChip} ${on ? styles.filterChipOn : ''}`}
                              onClick={() =>
                                setProductVisibilityFilter((prev) => toggleInList(prev, value))
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </Popover>
                </div>
              )}

              {productsError ? (
                <div className={styles.errorBanner} role="alert">{productsError}</div>
              ) : null}

              {!productsLoading ? (
                <ListPagination
                  page={paginatedProducts.page}
                  totalPages={paginatedProducts.totalPages}
                  totalItems={paginatedProducts.totalItems}
                  rangeStart={paginatedProducts.rangeStart}
                  rangeEnd={paginatedProducts.rangeEnd}
                  pageSize={PRODUCTS_PAGE_SIZE}
                  itemLabel="productos"
                  onPageChange={handleProductsPageChange}
                  loading={productsLoading}
                />
              ) : null}

              <Drawer
                open={productDrawerOpen}
                title={editingProductId ? 'Editar producto' : 'Nuevo producto'}
                onClose={() => setProductDrawerOpen(false)}
              >
                {editingProductId && editingProductLoading ? (
                  <CatalogLoadingState
                    title="Cargando producto…"
                    subtitle="Obteniendo opciones y detalle del menú."
                  />
                ) : (
                <ProductEditor
                  initial={productDraft}
                  activeCategories={activeCategories}
                  inactiveCategories={inactiveCategoriesForEditor}
                  restaurantProducts={copySourceProducts ?? products}
                  onCancel={() => setProductDrawerOpen(false)}
                  supplierId={supplierId}
                  supplierIdError={accessError}
                  visibilitySaving={productVisibilitySavingId === editingProductId}
                  onVisibilityChange={
                    editingProductId
                      ? (nextState) => {
                          void handleProductVisibilityChange(editingProductId, nextState);
                        }
                      : undefined
                  }
                  onSave={async (payload) => {
                    if (!supplierId || !accessToken) {
                      throw new Error(accessError ?? 'No hay sesión o restaurante disponible.');
                    }
                    const { catalogPromotions, product } = await saveSupplierProduct(
                      accessToken,
                      db,
                      storage,
                      supplierId,
                      {
                        ...payload,
                        existingOptionGroups: productDraft?.optionGroups,
                        catalogPromotions: catalogPromotionsRef.current ?? undefined,
                      },
                    );
                    catalogPromotionsRef.current = catalogPromotions;
                    const listProduct: ProductDraft = { ...product, optionGroups: [] };
                    setProducts((prev) => {
                      const index = prev.findIndex((item) => item.id === product.id);
                      let next: ProductDraft[];
                      if (index >= 0) {
                        next = [...prev];
                        next[index] = listProduct;
                      } else {
                        next = [listProduct, ...prev];
                      }
                      if (productFiltersActive) {
                        productsFilterCatalogRef.current = next;
                        setProductsTotalCount(next.length);
                      } else {
                        invalidateProductsFilterCatalog();
                      }
                      return next;
                    });
                    setCopySourceProducts((prev) => {
                      if (!prev) return prev;
                      const index = prev.findIndex((item) => item.id === product.id);
                      if (index >= 0) {
                        const next = [...prev];
                        next[index] = product;
                        return next;
                      }
                      return [product, ...prev];
                    });
                    if (!productFiltersActive) {
                      invalidateProductsPageCache();
                      void loadProductsTablePage(productsPage, { force: true });
                    }
                    setProductDrawerOpen(false);
                  }}
                />
                )}
              </Drawer>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CategoryEditor({
  initial,
  onCancel,
  onSave,
  supplierId,
  supplierIdError,
}: {
  initial: CategoryDraft | null;
  onCancel: () => void;
  onSave: (payload: { id?: Id; name: string; description: string; image: ImageDraft | null }) => Promise<void>;
  supplierId: string | null;
  supplierIdError: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [image, setImage] = useState<ImageDraft | null>(initial?.image ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

  useEffect(() => {
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setImage(initial?.image ?? null);
    setError(null);
    setSaving(false);
  }, [initial]);

  const canSave = name.trim().length > 0;

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) {
          setError('El nombre de la categoría es obligatorio.');
          return;
        }
        if (!supplierId) {
          setError(supplierIdError ?? 'No se pudo determinar tu supplierId.');
          return;
        }
        if (image?.file && image.file.size > MAX_IMAGE_BYTES) {
          setError('La imagen es muy pesada. Máximo permitido: 2 MB.');
          return;
        }
        void (async () => {
          try {
            setSaving(true);
            setError(null);
            await onSave({ id: initial?.id, name: name.trim(), description: description.trim(), image });
          } catch (err) {
            console.error(err);
            setError('No se pudo guardar la categoría. Revisa tu conexión e inténtalo de nuevo.');
          } finally {
            setSaving(false);
          }
        })();
      }}
    >
      <div className={styles.formGrid2}>
        <div className={styles.field}>
          <label className={styles.label}>Nombre de la categoría</label>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pozole" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Descripción (opcional)</label>
          <input className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Texto corto de referencia" />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Imagen (opcional)</label>
        <ImagePicker
          value={image}
          onChange={setImage}
          maxBytes={MAX_IMAGE_BYTES}
          helper="Sugerido: imagen cuadrada, mínimo 512×512. Máximo 2 MB."
        />
      </div>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSave || saving}>
          {saving ? 'Guardando…' : 'Guardar categoría'}
        </button>
      </div>
    </form>
  );
}

function ProductCategoryPicker({
  activeCategories,
  inactiveCategories,
  categoryIds,
  onChange,
}: {
  activeCategories: CategoryDraft[];
  inactiveCategories: CategoryDraft[];
  categoryIds: Id[];
  onChange: (next: Id[]) => void;
}) {
  const toggleCategory = (categoryId: Id, checked: boolean) => {
    onChange(
      checked
        ? Array.from(new Set([...categoryIds, categoryId]))
        : categoryIds.filter((id) => id !== categoryId),
    );
  };

  return (
    <div className={styles.categoryPickerSections}>
      <div className={styles.categoryPickerSection}>
        <div className={styles.categoryPickerSectionHead}>
          <span className={styles.categoryPickerSectionLabel}>Categorías activas</span>
          <Pill tone="success">Disponibles en menú</Pill>
        </div>
        <div className={styles.multiSelect} role="group" aria-label="Categorías activas">
          {activeCategories.length === 0 ? (
            <span className={styles.categoryPickerEmpty}>No hay categorías activas.</span>
          ) : (
            activeCategories.map((category) => {
              const checked = categoryIds.includes(category.id);
              return (
                <label key={category.id} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleCategory(category.id, e.target.checked)}
                  />
                  <span>{category.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {inactiveCategories.length > 0 ? (
        <div className={`${styles.categoryPickerSection} ${styles.categoryPickerSectionInactive}`}>
          <div className={styles.categoryPickerSectionHead}>
            <span className={styles.categoryPickerSectionLabel}>Categorías inactivas</span>
            <Pill tone="neutral">Fuera del menú</Pill>
          </div>
          <p className={styles.categoryPickerInactiveHint}>
            No se muestran en el menú público mientras estén desactivadas. Puedes seguir editando y
            guardando el producto.
          </p>
          <div
            className={`${styles.multiSelect} ${styles.multiSelectInactive}`}
            role="group"
            aria-label="Categorías inactivas asignadas"
          >
            {inactiveCategories.map((category) => {
              const checked = categoryIds.includes(category.id);
              return (
                <label key={category.id} className={`${styles.checkRow} ${styles.checkRowInactive}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleCategory(category.id, e.target.checked)}
                  />
                  <span>{category.name}</span>
                  <span className={styles.categoryPickerInactiveBadge}>Inactiva</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductEditor({
  initial,
  activeCategories,
  inactiveCategories,
  restaurantProducts,
  onCancel,
  onSave,
  supplierId,
  supplierIdError,
  onVisibilityChange,
  visibilitySaving = false,
}: {
  initial: ProductDraft | null;
  activeCategories: CategoryDraft[];
  inactiveCategories: CategoryDraft[];
  restaurantProducts: ProductDraft[];
  onCancel: () => void;
  onVisibilityChange?: (state: ProductVisibilityState) => void;
  visibilitySaving?: boolean;
  onSave: (payload: {
    id?: Id;
    name: string;
    description: string;
    price: MoneyUSD;
    discountUsd: number;
    discountMode: 'usd' | 'percent';
    discountPercent: number;
    image: ImageDraft | null;
    categoryIds: Id[];
    optionGroups: OptionGroupDraft[];
  }) => Promise<void>;
  supplierId: string | null;
  supplierIdError: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState<number>(initial?.price.amount ?? 0);
  const [discountMode, setDiscountMode] = useState<'usd' | 'percent'>('usd');
  const [discountUsd, setDiscountUsd] = useState<number>(initial?.discountUsd ?? 0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [image, setImage] = useState<ImageDraft | null>(initial?.image ?? null);
  const [categoryIds, setCategoryIds] = useState<Id[]>(initial?.categoryIds ?? []);
  const [optionGroups, setOptionGroups] = useState<OptionGroupDraft[]>(initial?.optionGroups ?? []);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    const p0 = initial?.price.amount ?? 0;
    const d0 = initial?.discountUsd ?? 0;
    setPrice(p0);
    setDiscountUsd(d0);
    setDiscountPercent(p0 > 0 ? Math.round((d0 / p0) * 10_000) / 100 : 0);
    setDiscountMode('usd');
    setImage(initial?.image ?? null);
    setCategoryIds(initial?.categoryIds ?? []);
    setOptionGroups(initial?.optionGroups ?? []);
    setDragGroupId(null);
    setDropGroupId(null);
    setError(null);
    setSaving(false);
  }, [initial]);

  const discountUsdEffective = useMemo(
    () => effectiveProductDiscountUsd(discountMode, price, discountUsd, discountPercent),
    [discountMode, price, discountUsd, discountPercent],
  );

  const priceNum = Number(price) || 0;
  /** Con precio > 0, el descuento no puede dejar el precio final en 0 o negativo */
  const discountLeavesPositiveFinal = priceNum <= 0 || priceNum - discountUsdEffective > 0;

  useEffect(() => {
    if (!initial && categoryIds.length === 0 && activeCategories.length > 0) {
      setCategoryIds([activeCategories[0]!.id]);
    }
  }, [initial, categoryIds.length, activeCategories]);

  const inactiveCategoryIds = useMemo(
    () => new Set(inactiveCategories.map((category) => category.id)),
    [inactiveCategories],
  );

  const hasActiveCategorySelected = useMemo(
    () => categoryIds.some((id) => activeCategories.some((category) => category.id === id)),
    [categoryIds, activeCategories],
  );

  const hasInactiveCategorySelected = useMemo(
    () => categoryIds.some((id) => inactiveCategoryIds.has(id)),
    [categoryIds, inactiveCategoryIds],
  );

  const visibilityCategoryContext = useMemo(
    () => ({
      hasActiveCategory: hasActiveCategorySelected,
      hasInactiveCategory: hasInactiveCategorySelected,
    }),
    [hasActiveCategorySelected, hasInactiveCategorySelected],
  );

  const visibilityMeta = useMemo(
    () => (initial ? productVisibilityMeta(initial, visibilityCategoryContext) : null),
    [initial, visibilityCategoryContext],
  );

  const canSave =
    name.trim().length > 0 &&
    categoryIds.length > 0 &&
    price >= 0 &&
    discountLeavesPositiveFinal;

  const activeOptionGroups = optionGroups.filter((g) => g.isActive);

  const copyableOptionGroups = useMemo(
    () =>
      listCopyableOptionGroups(
        restaurantProducts,
        initial?.id ?? null,
        optionGroups,
      ),
    [restaurantProducts, initial?.id, optionGroups],
  );

  const handleGroupDrop = (targetGroupId: string) => {
    if (!dragGroupId || dragGroupId === targetGroupId) return;
    const from = activeOptionGroups.findIndex((g) => g.id === dragGroupId);
    const to = activeOptionGroups.findIndex((g) => g.id === targetGroupId);
    if (from < 0 || to < 0) return;
    setOptionGroups((prev) => reorderActiveGroups(prev, from, to));
    setDragGroupId(null);
    setDropGroupId(null);
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError('El nombre del producto es obligatorio.');
          return;
        }
        if (categoryIds.length === 0) {
          setError('Selecciona al menos una categoría.');
          return;
        }
        const priceNorm = clampNumber(Number(price), 0, 1_000_000);
        const discountNorm = effectiveProductDiscountUsd(discountMode, priceNorm, discountUsd, discountPercent);
        const finalUsd = priceNorm - discountNorm;
        if (finalUsd < 0) {
          setError('El descuento no puede ser mayor al precio del producto.');
          return;
        }
        if (priceNorm > 0 && finalUsd <= 0) {
          setError('El descuento debe dejar un precio final mayor que cero.');
          return;
        }
        if (!supplierId) {
          setError(supplierIdError ?? 'No se pudo determinar tu supplierId.');
          return;
        }
        void (async () => {
          try {
            setSaving(true);
            setError(null);
            await onSave({
              id: initial?.id,
              name: name.trim(),
              description: description.trim(),
              price: money(priceNorm),
              discountUsd: discountNorm,
              discountMode,
              discountPercent,
              image,
              categoryIds,
              optionGroups: normalizeOptionGroups(optionGroups),
            });
          } catch (err) {
            console.error(err);
            const msg =
              err instanceof Error && err.message
                ? err.message
                : 'No se pudo guardar el producto. Revisa tu conexión e inténtalo de nuevo.';
            setError(msg);
          } finally {
            setSaving(false);
          }
        })();
      }}
    >
      {initial && onVisibilityChange ? (
        <div className={styles.banner}>
          <div className={styles.bannerLeft}>
            <div className={styles.bannerTitle}>Estado en el menú</div>
            <div className={styles.bannerText}>{productVisibilityMeta(initial).help}</div>
          </div>
          <div className={styles.bannerRight}>
            <ProductVisibilitySelect
              product={initial}
              saving={visibilitySaving}
              onChange={onVisibilityChange}
            />
          </div>
        </div>
      ) : null}

      <div className={styles.formGrid2}>
        <div className={styles.field}>
          <label className={styles.label}>Nombre del producto</label>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pozole (Grande)" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Categorías (selecciona 1+)</label>
          <div className={styles.multiSelect}>
            {categories.map((c) => {
              const checked = categoryIds.includes(c.id);
              return (
                <label key={c.id} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? Array.from(new Set([...categoryIds, c.id]))
                        : categoryIds.filter((id) => id !== c.id);
                      setCategoryIds(next);
                    }}
                  />
                  <span>{c.name}</span>
                </label>
              );
            })}
          </div>
          <div className={styles.helpText}>Un producto puede pertenecer a varias categorías, pero debe pertenecer al menos a una.</div>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Descripción (opcional)</label>
        <textarea
          className={styles.textarea}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="¿Qué hace especial a este producto? Ingredientes, tamaño, preparación, etc."
        />
      </div>

      <div className={styles.pricingGrid}>
        <label className={`${styles.label} ${styles.pricingL1}`}>Precio (MXN)</label>
        <div className={styles.pricingL2}>
          <div className={styles.discountFieldTop}>
            <label className={styles.label} htmlFor="product-discount-input">
              Descuento
            </label>
            <div className={styles.discountModeTabs} role="group" aria-label="Tipo de descuento">
              <button
                type="button"
                className={discountMode === 'usd' ? `${styles.discountModeTab} ${styles.discountModeTabActive}` : styles.discountModeTab}
                onClick={() => {
                  if (discountMode === 'percent') {
                    const p = Number(price) || 0;
                    const pct = clampNumber(Number(discountPercent), 0, 100);
                    const usd = p * (pct / 100);
                    setDiscountUsd(Math.round(usd * 100) / 100);
                  }
                  setDiscountMode('usd');
                }}
              >
                $
              </button>
              <button
                type="button"
                className={
                  discountMode === 'percent'
                    ? `${styles.discountModeTab} ${styles.discountModeTabActive}`
                    : styles.discountModeTab
                }
                onClick={() => {
                  if (discountMode === 'usd') {
                    const p = Number(price) || 0;
                    const d = Number(discountUsd) || 0;
                    setDiscountPercent(p > 0 ? Math.round((d / p) * 10_000) / 100 : 0);
                  }
                  setDiscountMode('percent');
                }}
              >
                %
              </button>
            </div>
          </div>
        </div>
        <label className={`${styles.label} ${styles.pricingL3}`}>Precio final</label>

        <input
          className={`${styles.input} ${styles.pricingI1}`}
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <div className={styles.pricingI2}>
          {discountMode === 'usd' ? (
            <input
              id="product-discount-input"
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              value={discountUsd}
              onChange={(e) => setDiscountUsd(Number(e.target.value))}
            />
          ) : (
            <input
              id="product-discount-input"
              className={styles.input}
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
            />
          )}
          {discountMode === 'usd' ? (
            <div className={`${styles.helpText} ${styles.pricingHelpLine}`}>
              Si se define, la app móvil mostrará el precio con descuento.
            </div>
          ) : (
            <div className={`${styles.helpText} ${styles.pricingHelpLine}`}>
              Equivale aprox. a <strong>{formatMoney(discountUsdEffective)}</strong> de descuento.
            </div>
          )}
          {priceNum > 0 && !discountLeavesPositiveFinal ? (
            <p className={styles.errorInline} role="alert">
              El descuento debe dejar un precio final mayor que cero.
            </p>
          ) : null}
        </div>
        <div className={`${styles.readonlyBox} ${styles.pricingI3}`}>
          {formatMoney(Math.max(0, Number(price || 0) - discountUsdEffective))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Imagen (opcional)</label>
        <ImagePicker
          value={image}
          onChange={setImage}
          maxBytes={3 * 1024 * 1024}
          helper="Sugerido: imagen 4:3 o cuadrada. Máximo 3 MB."
        />
      </div>

      <div className={styles.splitRow}>
        <div>
          <h3 className={styles.h3}>Opciones</h3>
          <p className={styles.muted}>
            Crea grupos de una o varias opciones, obligatorios u opcionales. Puedes limitar cuántas opciones elige el cliente. Los ítems pueden tener costo extra.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() =>
            setOptionGroups((prev) => [
              ...prev,
              {
                id: uid('og'),
                title: 'Nuevo grupo de opciones',
                required: false,
                selection: 'multi',
                maxSelections: null,
                isActive: true,
                items: [{ id: uid('oi'), label: 'Nueva opción', priceDeltaUsd: 0, isActive: true }],
              },
            ])
          }
        >
          + Agregar grupo
        </button>
      </div>

      {copyableOptionGroups.length > 0 ? (
        <div className={styles.copyGroupBar}>
          <p className={styles.copyGroupBarText}>
            Reutiliza un grupo activo de otro producto del restaurante.
          </p>
          <select
              className={styles.copyGroupSelect}
              aria-label="Copiar grupo existente de otro producto"
              value=""
              onChange={(e) => {
                const key = e.target.value;
                if (!key) return;
                const entry = copyableOptionGroups.find((item) => item.key === key);
                if (!entry) return;
                setOptionGroups((prev) => [
                  ...prev,
                  cloneOptionGroupForProduct(entry.group, uid),
                ]);
              }}
            >
              <option value="">Elegir grupo para copiar…</option>
              {copyableOptionGroups.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.group.title} · {entry.sourceProductName}
                </option>
              ))}
            </select>
        </div>
      ) : null}

      {activeOptionGroups.length === 0 ? (
        <div className={styles.miniEmpty}>
          Aún no hay grupos de opciones. Agrega uno si tu producto tiene variantes o complementos.
        </div>
      ) : (
        <div className={styles.optionGroups}>
          {activeOptionGroups.map((g) => (
            <div
              key={g.id}
              className={`${styles.optionGroupSortable} ${
                dragGroupId === g.id ? styles.optionGroupDragging : ''
              } ${dropGroupId === g.id && dragGroupId !== g.id ? styles.optionGroupDropTarget : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragGroupId && dragGroupId !== g.id) {
                  setDropGroupId(g.id);
                }
              }}
              onDragLeave={() => {
                if (dropGroupId === g.id) setDropGroupId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleGroupDrop(g.id);
              }}
            >
              <button
                type="button"
                className={styles.dragHandle}
                draggable
                aria-label={`Reordenar grupo ${g.title || 'sin nombre'}`}
                title="Arrastrar para reordenar"
                onDragStart={(e) => {
                  const container = (e.currentTarget as HTMLElement).closest(
                    `.${styles.optionGroupSortable}`,
                  );
                  if (container instanceof HTMLElement) {
                    attachDragOverlay(e, container, {
                      offsetX: 24,
                      offsetY: 28,
                      overlayClassName: styles.dragOverlayClone,
                      bodyDraggingClassName: styles.bodyDragging,
                    });
                  }
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', g.id);
                  setDragGroupId(g.id);
                }}
                onDragEnd={() => {
                  setDragGroupId(null);
                  setDropGroupId(null);
                }}
              >
                <DragIndicatorIcon sx={{ fontSize: 20 }} aria-hidden />
              </button>
              <OptionGroupEditor
                group={g}
                onChange={(next) =>
                  setOptionGroups((prev) => prev.map((x) => (x.id === g.id ? next : x)))
                }
                onDisable={() => setOptionGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, isActive: false } : x)))}
              />
            </div>
          ))}
        </div>
      )}

      {optionGroups.some((g) => !g.isActive) ? (
        <div className={styles.disabledSection}>
          <div className={styles.disabledHeader}>
            <h4 className={styles.disabledTitle}>Grupos desactivados</h4>
            <span className={styles.disabledHint}>
              Puedes reactivarlos en cualquier momento.
            </span>
          </div>
          <div className={styles.disabledList}>
            {optionGroups
              .filter((g) => !g.isActive)
              .map((g) => (
                <div key={g.id} className={styles.disabledRow}>
                  <div className={styles.disabledMeta}>
                    <div className={styles.disabledName}>{g.title || 'Grupo sin nombre'}</div>
                    <div className={styles.disabledSub}>
                      {g.required ? 'Obligatorio' : 'Opcional'} ·{' '}
                      {g.selection === 'single'
                        ? 'Una opción'
                        : g.maxSelections != null
                          ? `Varias opciones (máx. ${g.maxSelections})`
                          : 'Varias opciones'} ·{' '}
                      {g.items.filter((i) => i.isActive).length} ítems
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() =>
                      setOptionGroups((prev) =>
                        prev.map((x) => (x.id === g.id ? { ...x, isActive: true } : x))
                      )
                    }
                  >
                    Activar grupo
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSave || saving}>
          {saving ? 'Guardando…' : 'Guardar producto'}
        </button>
      </div>
    </form>
  );
}

function ProductMobileControls({
  categories,
  productCategoryFilterIds,
  productCategoryActiveFilter,
  productVisibilityFilter,
  productPriceSort,
  setProductPriceSort,
  productDiscountSort,
  setProductDiscountSort,
  productTotalSort,
  setProductTotalSort,
  categoryFilterAnchor,
  setCategoryFilterAnchor,
  statusFilterAnchor,
  setStatusFilterAnchor,
  selectedStatusTags,
  selectedCategoryStatusTags,
  removeCategoryFilter,
  removeCategoryStatusFilter,
  removeStatusTag,
  productFiltersActive,
  onClearFilters,
}: {
  categories: CategoryDraft[];
  productCategoryFilterIds: Id[];
  productCategoryActiveFilter: CategoryActiveFilter[];
  productVisibilityFilter: ProductVisibilityFilter[];
  productPriceSort: ColumnSort;
  setProductPriceSort: React.Dispatch<React.SetStateAction<ColumnSort>>;
  productDiscountSort: ColumnSort;
  setProductDiscountSort: React.Dispatch<React.SetStateAction<ColumnSort>>;
  productTotalSort: ColumnSort;
  setProductTotalSort: React.Dispatch<React.SetStateAction<ColumnSort>>;
  categoryFilterAnchor: HTMLElement | null;
  setCategoryFilterAnchor: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  statusFilterAnchor: HTMLElement | null;
  setStatusFilterAnchor: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  selectedStatusTags: { key: string; label: string }[];
  selectedCategoryStatusTags: { key: string; label: string }[];
  removeCategoryFilter: (id: Id) => void;
  removeCategoryStatusFilter: (key: string) => void;
  removeStatusTag: (key: string) => void;
  productFiltersActive: boolean;
  onClearFilters: () => void;
}) {
  const categoryFilterCount = productCategoryFilterIds.length + productCategoryActiveFilter.length;

  function sortLabel(sort: ColumnSort): string {
    if (sort === 'asc') return ' ↑';
    if (sort === 'desc') return ' ↓';
    return '';
  }

  return (
    <div className={styles.mobileTableControls} aria-label="Filtros y orden en móvil">
      <div className={styles.mobileControlSection}>
        <span className={styles.mobileControlHeading}>Filtrar</span>
        <div className={styles.mobileControlRow}>
          <button
            type="button"
            className={`${styles.mobileControlBtn} ${categoryFilterCount > 0 ? styles.mobileControlBtnActive : ''}`}
            aria-expanded={Boolean(categoryFilterAnchor)}
            aria-haspopup="dialog"
            onClick={(e) => {
              setStatusFilterAnchor(null);
              setCategoryFilterAnchor(categoryFilterAnchor ? null : e.currentTarget);
            }}
          >
            <FilterListIcon sx={{ fontSize: 16 }} aria-hidden />
            Categorías
            {categoryFilterCount > 0 ? (
              <span className={styles.mobileControlCount}>{categoryFilterCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`${styles.mobileControlBtn} ${productVisibilityFilter.length > 0 ? styles.mobileControlBtnActive : ''}`}
            aria-expanded={Boolean(statusFilterAnchor)}
            aria-haspopup="dialog"
            onClick={(e) => {
              setCategoryFilterAnchor(null);
              setStatusFilterAnchor(statusFilterAnchor ? null : e.currentTarget);
            }}
          >
            <FilterListIcon sx={{ fontSize: 16 }} aria-hidden />
            Estado
            {productVisibilityFilter.length > 0 ? (
              <span className={styles.mobileControlCount}>{productVisibilityFilter.length}</span>
            ) : null}
          </button>
        </div>
      </div>

      <div className={styles.mobileControlSection}>
        <span className={styles.mobileControlHeading}>Ordenar</span>
        <div className={styles.mobileControlRow}>
          <button
            type="button"
            className={`${styles.mobileControlBtn} ${productPriceSort !== 'none' ? styles.mobileControlBtnActive : ''}`}
            onClick={() => setProductPriceSort((s) => cycleColumnSort(s))}
          >
            Precio{sortLabel(productPriceSort)}
          </button>
          <button
            type="button"
            className={`${styles.mobileControlBtn} ${productDiscountSort !== 'none' ? styles.mobileControlBtnActive : ''}`}
            onClick={() => setProductDiscountSort((s) => cycleColumnSort(s))}
          >
            Descuento{sortLabel(productDiscountSort)}
          </button>
          <button
            type="button"
            className={`${styles.mobileControlBtn} ${productTotalSort !== 'none' ? styles.mobileControlBtnActive : ''}`}
            onClick={() => setProductTotalSort((s) => cycleColumnSort(s))}
          >
            Total{sortLabel(productTotalSort)}
          </button>
        </div>
      </div>

      {categoryFilterCount > 0 || selectedStatusTags.length > 0 ? (
        <div className={styles.mobileActiveFilters}>
          {selectedCategoryStatusTags.map((tag) => (
            <span key={tag.key} className={styles.mobileFilterBadge}>
              <span className={styles.mobileFilterBadgeText}>{tag.label}</span>
              <button
                type="button"
                className={styles.mobileFilterBadgeRemove}
                aria-label={`Quitar filtro ${tag.label}`}
                onClick={() => removeCategoryStatusFilter(tag.key)}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </button>
            </span>
          ))}
          {productCategoryFilterIds.map((id) => {
            const name = categories.find((c) => c.id === id)?.name ?? id;
            return (
              <span key={id} className={styles.mobileFilterBadge}>
                <span className={styles.mobileFilterBadgeText}>{name}</span>
                <button
                  type="button"
                  className={styles.mobileFilterBadgeRemove}
                  aria-label={`Quitar filtro ${name}`}
                  onClick={() => removeCategoryFilter(id)}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </button>
              </span>
            );
          })}
          {selectedStatusTags.map((t) => (
            <span key={t.key} className={styles.mobileFilterBadge}>
              <span className={styles.mobileFilterBadgeText}>{t.label}</span>
              <button
                type="button"
                className={styles.mobileFilterBadgeRemove}
                aria-label={`Quitar filtro ${t.label}`}
                onClick={() => removeStatusTag(t.key)}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {productFiltersActive ? (
        <button type="button" className={styles.mobileClearFiltersBtn} onClick={onClearFilters}>
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

function formatMaxSelectionsInputValue(
  maxSelections: number | null,
  maxSelectable: number,
): string {
  if (maxSelections == null) return '';
  return String(Math.min(maxSelections, maxSelectable));
}

function OptionGroupMaxSelectionsInput({
  group,
  maxSelectable,
  onChange,
}: {
  group: OptionGroupDraft;
  maxSelectable: number;
  onChange: (next: OptionGroupDraft) => void;
}) {
  const [text, setText] = useState(() =>
    formatMaxSelectionsInputValue(group.maxSelections, maxSelectable),
  );
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(formatMaxSelectionsInputValue(group.maxSelections, maxSelectable));
  }, [group.id, group.maxSelections, maxSelectable]);

  const commit = (rawText: string) => {
    const raw = rawText.trim();
    if (!raw) {
      onChange({ ...group, maxSelections: null });
      setText('');
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setText(formatMaxSelectionsInputValue(group.maxSelections, maxSelectable));
      return;
    }
    const nextMax = clampNumber(Math.round(parsed), 1, maxSelectable);
    onChange({ ...group, maxSelections: nextMax });
    setText(String(nextMax));
  };

  return (
    <label className={styles.maxSelectionsField}>
      <span>Máx. a elegir</span>
      <input
        className={styles.input}
        type="number"
        min={1}
        max={maxSelectable}
        step={1}
        value={text}
        placeholder="Sin límite"
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          focusedRef.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label="Cantidad máxima de opciones que puede elegir el cliente"
      />
    </label>
  );
}

function optionGroupMobileSummary(group: OptionGroupDraft, activeItemCount: number): string {
  const requirement = group.required ? 'debe elegir' : 'puede omitir';
  if (group.selection === 'single') {
    return `Cliente: ${requirement} • elige 1`;
  }
  const max = group.maxSelections;
  if (group.required) {
    if (max != null) {
      return `Cliente: ${requirement} • elige entre 1 y ${max}`;
    }
    return `Cliente: ${requirement} • elige al menos 1`;
  }
  if (max != null) {
    return `Cliente: ${requirement} • elige hasta ${max}`;
  }
  if (activeItemCount > 0) {
    return `Cliente: ${requirement} • elige ninguno o varios (máx. ${activeItemCount})`;
  }
  return `Cliente: ${requirement} • elige ninguno o varios`;
}

function OptionGroupEditor({
  group,
  onChange,
  onDisable,
}: {
  group: OptionGroupDraft;
  onChange: (next: OptionGroupDraft) => void;
  onDisable: () => void;
}) {
  const activeItems = group.items.filter((i) => i.isActive);
  const inactiveItems = group.items.filter((i) => !i.isActive);
  const maxSelectable = Math.max(1, activeItems.length);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemId, setDropItemId] = useState<string | null>(null);

  const handleItemDrop = (targetItemId: string) => {
    if (!dragItemId || dragItemId === targetItemId) return;
    const from = activeItems.findIndex((item) => item.id === dragItemId);
    const to = activeItems.findIndex((item) => item.id === targetItemId);
    if (from < 0 || to < 0) return;
    onChange(reorderActiveItems(group, from, to));
    setDragItemId(null);
    setDropItemId(null);
  };

  const removeItem = (itemId: string) => {
    onChange({ ...group, items: group.items.filter((item) => item.id !== itemId) });
  };

  return (
    <div className={styles.optionGroupCard}>
      <div className={styles.optionGroupHeader}>
        <div className={styles.optionGroupLeft}>
          <input
            className={styles.input}
            value={group.title}
            onChange={(e) => onChange({ ...group, title: e.target.value })}
            placeholder="Ej. ¿Cómo te gusta tu pozole?"
          />
          <div className={styles.optionGroupMeta}>
            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => onChange({ ...group, required: e.target.checked })}
              />
              <span>Obligatorio</span>
            </label>
            <div className={styles.segment}>
              <button
                type="button"
                className={`${styles.segmentBtn} ${group.selection === 'single' ? styles.segmentBtnActive : ''}`}
                onClick={() => onChange({ ...group, selection: 'single', maxSelections: 1 })}
              >
                Una opción
              </button>
              <button
                type="button"
                className={`${styles.segmentBtn} ${group.selection === 'multi' ? styles.segmentBtnActive : ''}`}
                onClick={() =>
                  onChange({
                    ...group,
                    selection: 'multi',
                    maxSelections: group.selection === 'multi' ? group.maxSelections : null,
                  })
                }
              >
                Varias opciones
              </button>
            </div>
            {group.selection === 'multi' ? (
              <OptionGroupMaxSelectionsInput
                group={group}
                maxSelectable={maxSelectable}
                onChange={onChange}
              />
            ) : null}
          </div>
        </div>
        <div className={styles.optionGroupRight}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() =>
              onChange({
                ...group,
                items: [
                  ...group.items,
                  { id: uid('oi'), label: 'Nueva opción', priceDeltaUsd: 0, isActive: true },
                ],
              })
            }
          >
            + Agregar ítem
          </button>
          <button type="button" className={styles.dangerGhostBtn} onClick={onDisable}>
            Desactivar grupo
          </button>
        </div>
      </div>

      {activeItems.length === 0 ? (
        <div className={styles.miniEmpty}>No hay ítems en este grupo.</div>
      ) : (
        <div className={styles.optionItems}>
          {activeItems.map((it) => (
            <div
              key={it.id}
              className={`${styles.optionItemRow} ${
                dragItemId === it.id ? styles.optionItemDragging : ''
              } ${dropItemId === it.id && dragItemId !== it.id ? styles.optionItemDropTarget : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragItemId && dragItemId !== it.id) {
                  setDropItemId(it.id);
                }
              }}
              onDragLeave={() => {
                if (dropItemId === it.id) setDropItemId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleItemDrop(it.id);
              }}
            >
              <button
                type="button"
                className={styles.dragHandle}
                draggable
                aria-label={`Reordenar opción ${it.label || 'sin nombre'}`}
                title="Arrastrar para reordenar"
                onDragStart={(e) => {
                  const row = (e.currentTarget as HTMLElement).closest(`.${styles.optionItemRow}`);
                  if (row instanceof HTMLElement) {
                    attachDragOverlay(e, row, {
                      offsetX: 18,
                      offsetY: 20,
                      overlayClassName: styles.dragOverlayClone,
                      bodyDraggingClassName: styles.bodyDragging,
                    });
                  }
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', it.id);
                  setDragItemId(it.id);
                }}
                onDragEnd={() => {
                  setDragItemId(null);
                  setDropItemId(null);
                }}
              >
                <DragIndicatorIcon sx={{ fontSize: 18 }} aria-hidden />
              </button>
              <input
                className={styles.input}
                value={it.label}
                onChange={(e) => {
                  const nextItems = group.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x));
                  onChange({ ...group, items: nextItems });
                }}
                placeholder="Nombre de la opción"
              />
              <div className={styles.priceDelta}>
                <span className={styles.deltaPrefix}>+ MXN</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.01"
                  value={it.priceDeltaUsd}
                  onChange={(e) => {
                    const v = clampNumber(Number(e.target.value), 0, 1_000_000);
                    const nextItems = group.items.map((x) => (x.id === it.id ? { ...x, priceDeltaUsd: v } : x));
                    onChange({ ...group, items: nextItems });
                  }}
                  aria-label="Costo extra en MXN"
                />
              </div>
              <div className={styles.optionItemActions}>
                <button
                  type="button"
                  className={styles.dangerGhostBtn}
                  onClick={() =>
                    onChange({
                      ...group,
                      items: group.items.map((x) =>
                        x.id === it.id ? { ...x, isActive: false } : x,
                      ),
                    })
                  }
                  aria-label={`Desactivar opción ${it.label}`}
                  title="Desactivar ítem"
                >
                  <VisibilityOffOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.dangerGhostBtn}
                  onClick={() => removeItem(it.id)}
                  aria-label={`Eliminar opción ${it.label}`}
                  title="Eliminar ítem"
                >
                  <DeleteOutlineOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {inactiveItems.length > 0 ? (
        <div className={styles.inactiveItemsSection}>
          <div className={styles.inactiveItemsHeader}>
            <h5 className={styles.inactiveItemsTitle}>Ítems desactivados</h5>
            <span className={styles.inactiveItemsHint}>No los ven tus clientes.</span>
          </div>
          <div className={styles.inactiveItemsList}>
            {inactiveItems.map((it) => (
              <div key={it.id} className={styles.inactiveItemRow}>
                <div className={styles.inactiveItemMeta}>
                  <span className={styles.inactiveItemLabel}>{it.label || 'Opción sin nombre'}</span>
                  {it.priceDeltaUsd > 0 ? (
                    <span className={styles.inactiveItemSub}>
                      + MXN {it.priceDeltaUsd.toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <div className={styles.inactiveItemActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() =>
                      onChange({
                        ...group,
                        items: group.items.map((x) =>
                          x.id === it.id ? { ...x, isActive: true } : x,
                        ),
                      })
                    }
                  >
                    Activar ítem
                  </button>
                  <button
                    type="button"
                    className={styles.dangerGhostBtn}
                    onClick={() => removeItem(it.id)}
                    aria-label={`Eliminar opción ${it.label}`}
                    title="Eliminar ítem"
                  >
                    <DeleteOutlineOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.optionGroupFooter}>
        <span className={styles.muted}>
          {optionGroupMobileSummary(group, activeItems.length)}
        </span>
      </div>
    </div>
  );
}

