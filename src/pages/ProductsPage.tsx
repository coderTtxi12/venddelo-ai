import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ProductsPage.module.css';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FilterListIcon from '@mui/icons-material/FilterList';
import Popover from '@mui/material/Popover';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, storage } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import {
  CATEGORIES_PAGE_SIZE,
  fetchSupplierCategoriesPage,
  normalizeOptionGroups,
  PRODUCTS_PAGE_SIZE,
  fetchSupplierProductsPage,
  resolveSupplierIdByEmail,
  saveSupplierCategory,
  updateSupplierCategoryActive,
  saveSupplierProduct,
  updateSupplierProductActive,
  updateSupplierProductReviewStatus,
} from '../services/db';
import type {
  ApprovalStatus,
  CategoryDraft,
  Id,
  ImageDraft,
  MoneyUSD,
  OptionGroupDraft,
  ProductDraft,
} from '../services/db';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function money(amount: number): MoneyUSD {
  return { amount, currency: 'USD' };
}

function clampNumber(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Descuento efectivo en USD; en modo % se calcula desde precio y porcentaje (solo UI). */
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

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

function productLineTotalUsd(p: { price: { amount: number }; discountUsd: number }): number {
  const raw = p.price.amount - p.discountUsd;
  return raw > 0 ? raw : 0;
}

const APPROVAL_FILTER_ORDER: ApprovalStatus[] = ['draft', 'pending_review', 'approved', 'rejected'];

type CatalogVisibilityFilter = 'active' | 'inactive';

type ColumnSort = 'none' | 'asc' | 'desc';

function badgeForApproval(status: ApprovalStatus): { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' } {
  switch (status) {
    case 'pending_review':
      return { label: 'Pendiente de revisión', tone: 'info' };
    case 'approved':
      return { label: 'Aprobado', tone: 'success' };
    case 'rejected':
      return { label: 'Rechazado', tone: 'danger' };
    case 'draft':
    default:
      return { label: 'Borrador', tone: 'neutral' };
  }
}

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
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

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'info' | 'success' | 'danger' }) {
  return <span className={`${styles.pill} ${styles[`pill_${tone}`]}`}>{children}</span>;
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

export default function ProductsPage() {
  const { firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'categories' | 'products'>('products');

  // supplierId is the supplier doc id in `suppliers/`
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierIdError, setSupplierIdError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSupplierId() {
      setSupplierId(null);
      setSupplierIdError(null);
      const email = firebaseUser?.email ?? '';
      const result = await resolveSupplierIdByEmail(db, email);
      if (cancelled) return;
      if ('error' in result) {
        setSupplierIdError(result.error);
        return;
      }
      setSupplierId(result.supplierId);
    }
    void loadSupplierId();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.email]);

  // Categorías desde Firestore (paginadas)
  const [categories, setCategories] = useState<CategoryDraft[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesLoadingMore, setCategoriesLoadingMore] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoriesHasMore, setCategoriesHasMore] = useState(false);
  const categoriesCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  async function loadCategoriesFirstPage() {
    if (!supplierId) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    categoriesCursorRef.current = null;
    try {
      const result = await fetchSupplierCategoriesPage(db, supplierId, { cursor: null });
      categoriesCursorRef.current = result.cursor;
      setCategoriesHasMore(result.hasMore);
      setCategories(result.items);
    } catch (e) {
      console.error(e);
      setCategoriesError('No se pudieron cargar las categorías. Intenta de nuevo.');
      setCategories([]);
      setCategoriesHasMore(false);
    } finally {
      setCategoriesLoading(false);
    }
  }

  async function loadCategoriesMore() {
    if (!supplierId || !categoriesHasMore || categoriesLoadingMore || !categoriesCursorRef.current) return;
    setCategoriesLoadingMore(true);
    setCategoriesError(null);
    try {
      const result = await fetchSupplierCategoriesPage(db, supplierId, {
        cursor: categoriesCursorRef.current,
      });
      categoriesCursorRef.current = result.cursor;
      setCategoriesHasMore(result.hasMore);
      setCategories((prev) => [...prev, ...result.items]);
    } catch (e) {
      console.error(e);
      setCategoriesError('No se pudieron cargar más categorías. Intenta de nuevo.');
    } finally {
      setCategoriesLoadingMore(false);
    }
  }

  // Productos desde Firestore (paginados)
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadingMore, setProductsLoadingMore] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsHasMore, setProductsHasMore] = useState(false);
  const productsCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  async function loadProductsFirstPage() {
    if (!supplierId) return;
    setProductsLoading(true);
    setProductsError(null);
    productsCursorRef.current = null;
    try {
      const result = await fetchSupplierProductsPage(db, supplierId, { cursor: null });
      productsCursorRef.current = result.cursor;
      setProductsHasMore(result.hasMore);
      setProducts(result.items);
    } catch (e) {
      console.error(e);
      setProductsError('No se pudieron cargar los productos. Intenta de nuevo.');
      setProducts([]);
      setProductsHasMore(false);
    } finally {
      setProductsLoading(false);
    }
  }

  async function loadProductsMore() {
    if (!supplierId || !productsHasMore || productsLoadingMore || !productsCursorRef.current) return;
    setProductsLoadingMore(true);
    setProductsError(null);
    try {
      const result = await fetchSupplierProductsPage(db, supplierId, {
        cursor: productsCursorRef.current,
      });
      productsCursorRef.current = result.cursor;
      setProductsHasMore(result.hasMore);
      setProducts((prev) => [...prev, ...result.items]);
    } catch (e) {
      console.error(e);
      setProductsError('No se pudieron cargar más productos. Intenta de nuevo.');
    } finally {
      setProductsLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadProductsFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  useEffect(() => {
    void loadCategoriesFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);

  const [categorySearch, setCategorySearch] = useState('');
  const [productNameFilter, setProductNameFilter] = useState('');
  const [productCategoryFilterIds, setProductCategoryFilterIds] = useState<Id[]>([]);
  const [productPriceSort, setProductPriceSort] = useState<ColumnSort>('none');
  const [productDiscountSort, setProductDiscountSort] = useState<ColumnSort>('none');
  const [productTotalSort, setProductTotalSort] = useState<ColumnSort>('none');
  const [productApprovalFilter, setProductApprovalFilter] = useState<ApprovalStatus[]>([]);
  const [productCatalogFilter, setProductCatalogFilter] = useState<CatalogVisibilityFilter[]>([]);
  const [productActiveToggleId, setProductActiveToggleId] = useState<Id | null>(null);
  const [productActiveError, setProductActiveError] = useState<string | null>(null);
  const [productReviewToggleId, setProductReviewToggleId] = useState<Id | null>(null);
  const [productReviewError, setProductReviewError] = useState<string | null>(null);
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

  const productFiltersActive = useMemo(() => {
    return (
      productNameFilter.trim().length > 0 ||
      productCategoryFilterIds.length > 0 ||
      productPriceSort !== 'none' ||
      productDiscountSort !== 'none' ||
      productTotalSort !== 'none' ||
      productApprovalFilter.length > 0 ||
      productCatalogFilter.length > 0
    );
  }, [
    productNameFilter,
    productCategoryFilterIds,
    productPriceSort,
    productDiscountSort,
    productTotalSort,
    productApprovalFilter,
    productCatalogFilter,
  ]);

  const displayedProducts = useMemo(() => {
    let rows = products;
    const nameQ = productNameFilter.trim().toLowerCase();
    if (nameQ) {
      rows = rows.filter((p) => p.name.toLowerCase().includes(nameQ));
    }
    if (productCategoryFilterIds.length > 0) {
      rows = rows.filter((p) => p.categoryIds.some((id) => productCategoryFilterIds.includes(id)));
    }
    if (productApprovalFilter.length > 0) {
      rows = rows.filter((p) => productApprovalFilter.includes(p.approvalStatus));
    }
    if (productCatalogFilter.length > 0) {
      rows = rows.filter((p) => {
        const key: CatalogVisibilityFilter = p.isActive ? 'active' : 'inactive';
        return productCatalogFilter.includes(key);
      });
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
        const ta = productLineTotalUsd(a);
        const tb = productLineTotalUsd(b);
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
    productApprovalFilter,
    productCatalogFilter,
    productPriceSort,
    productDiscountSort,
    productTotalSort,
  ]);

  function clearProductTableFilters() {
    setProductNameFilter('');
    setProductCategoryFilterIds([]);
    setProductPriceSort('none');
    setProductDiscountSort('none');
    setProductTotalSort('none');
    setProductApprovalFilter([]);
    setProductCatalogFilter([]);
  }

  const [categoryFilterAnchor, setCategoryFilterAnchor] = useState<HTMLElement | null>(null);
  const [statusFilterAnchor, setStatusFilterAnchor] = useState<HTMLElement | null>(null);

  const selectedCategoryLabels = useMemo(() => {
    return productCategoryFilterIds
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
  }, [productCategoryFilterIds, categories]);

  const selectedStatusTags = useMemo(() => {
    const tags: { key: string; label: string }[] = [];
    for (const st of productApprovalFilter) {
      tags.push({ key: `a:${st}`, label: badgeForApproval(st).label });
    }
    if (productCatalogFilter.includes('active')) tags.push({ key: 'c:active', label: 'Activo' });
    if (productCatalogFilter.includes('inactive')) tags.push({ key: 'c:inactive', label: 'Inactivo' });
    return tags;
  }, [productApprovalFilter, productCatalogFilter]);

  function removeCategoryFilter(id: Id) {
    setProductCategoryFilterIds((prev) => prev.filter((x) => x !== id));
  }

  function removeStatusTag(key: string) {
    if (key.startsWith('a:')) {
      const st = key.slice(2) as ApprovalStatus;
      setProductApprovalFilter((prev) => prev.filter((x) => x !== st));
    } else if (key === 'c:active') {
      setProductCatalogFilter((prev) => prev.filter((x) => x !== 'active'));
    } else if (key === 'c:inactive') {
      setProductCatalogFilter((prev) => prev.filter((x) => x !== 'inactive'));
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

  const productDraft = useMemo(() => {
    if (!editingProductId) return null;
    return products.find((p) => p.id === editingProductId) ?? null;
  }, [products, editingProductId]);

  function openNewCategory() {
    setEditingCategoryId(null);
    setCategoryDrawerOpen(true);
  }

  function openEditCategory(id: Id) {
    setEditingCategoryId(id);
    setCategoryDrawerOpen(true);
  }

  function openNewProduct() {
    setEditingProductId(null);
    setProductDrawerOpen(true);
  }

  function openEditProduct(id: Id) {
    setEditingProductId(id);
    setProductDrawerOpen(true);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Productos</h1>
          <p className={styles.subtitle}>
            Administra tus categorías y productos. Los productos requieren aprobación del administrador antes de ser visibles en el marketplace móvil.
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
              {filteredCategories.map((c) => (
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
                          if (!supplierId) return;
                          void (async () => {
                            setCategoryActiveError(null);
                            setCategoryActiveToggleId(c.id);
                            try {
                              await updateSupplierCategoryActive(db, supplierId, c.id, false);
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
                          if (!supplierId) return;
                          void (async () => {
                            setCategoryActiveError(null);
                            setCategoryActiveToggleId(c.id);
                            try {
                              await updateSupplierCategoryActive(db, supplierId, c.id, true);
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

          {!categoriesLoading && categoriesHasMore ? (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => void loadCategoriesMore()}
                disabled={categoriesLoadingMore}
              >
                {categoriesLoadingMore ? 'Cargando…' : `Cargar ${CATEGORIES_PAGE_SIZE} más`}
              </button>
            </div>
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
              supplierIdError={supplierIdError}
              onSave={async (payload) => {
                if (!supplierId) throw new Error(supplierIdError ?? 'supplierId no disponible.');
                await saveSupplierCategory(db, storage, supplierId, payload);
                await loadCategoriesFirstPage();
                setCategoryDrawerOpen(false);
              }}
            />
          </Drawer>
        </section>
      ) : (
        <section className={styles.section}>
          {activeCategories.length === 0 ? (
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
                  subtitle="Crea tu primer producto y envíalo para aprobación del administrador."
                  action={
                    <button type="button" className={styles.primaryBtn} onClick={openNewProduct}>
                      + Nuevo producto
                    </button>
                  }
                />
              ) : (
                <div className={styles.tableWrap}>
                  {productActiveError ? (
                    <div className={styles.errorBanner} role="alert">{productActiveError}</div>
                  ) : null}
                  {productReviewError ? (
                    <div className={styles.errorBanner} role="alert">{productReviewError}</div>
                  ) : null}
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
                          {selectedCategoryLabels.length > 0 ? (
                            <div className={styles.thHeaderBadges}>
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
                        <th className={styles.thDashboard} aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {displayedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className={styles.filterNoResults}>
                            <div className={styles.filterNoResultsInner}>
                              <p>Ningún producto coincide con los filtros actuales.</p>
                              {productFiltersActive ? (
                                <button type="button" className={styles.secondaryBtn} onClick={clearProductTableFilters}>
                                  Limpiar filtros
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {displayedProducts.map((p) => {
                        const approval = badgeForApproval(p.approvalStatus);
                        const catNames = p.categoryIds
                          .map((id) => categories.find((c) => c.id === id)?.name)
                          .filter(Boolean) as string[];
                        return (
                          <tr
                            key={p.id}
                            className={`${styles.rowHover} ${styles.clickableRow} ${p.isActive ? '' : styles.rowInactive}`}
                            tabIndex={0}
                            onClick={() => openEditProduct(p.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openEditProduct(p.id);
                              }
                            }}
                          >
                            <td>
                              <div className={styles.productCell}>
                                <div className={styles.productThumb}>
                                  {p.image ? <img src={p.image.previewUrl} alt="" /> : <div className={styles.thumbEmpty}>Sin imagen</div>}
                                </div>
                                <div>
                                  <div className={styles.productName}>{p.name}</div>
                                  <div className={styles.productDesc}>{p.description || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className={styles.chips}>
                                {catNames.length > 0 ? catNames.map((n) => <span key={n} className={styles.chip}>{n}</span>) : <span className={styles.muted}>—</span>}
                              </div>
                            </td>
                            <td className={styles.nowrap}>{formatUsd(p.price.amount)}</td>
                            <td className={styles.nowrap}>{p.discountUsd > 0 ? `-${formatUsd(p.discountUsd)}` : '—'}</td>
                            <td className={styles.nowrap}>{formatUsd(productLineTotalUsd(p))}</td>
                            <td>
                              <div className={styles.statusCol}>
                                <Pill tone={approval.tone}>{approval.label}</Pill>
                                <Pill tone={p.isActive ? 'success' : 'neutral'}>
                                  {p.isActive ? 'Activo' : 'Inactivo'}
                                </Pill>
                              </div>
                            </td>
                            <td className={styles.actionsCell}>
                              <div className={styles.productRowActions}>
                                {p.approvalStatus === 'draft' || p.approvalStatus === 'pending_review' ? (
                                  p.approvalStatus === 'draft' ? (
                                    <button
                                      type="button"
                                      className={styles.reviewFlowPrimaryBtn}
                                      disabled={
                                        !supplierId ||
                                        productReviewToggleId === p.id ||
                                        productActiveToggleId === p.id
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!supplierId) return;
                                        void (async () => {
                                          setProductReviewError(null);
                                          setProductReviewToggleId(p.id);
                                          try {
                                            await updateSupplierProductReviewStatus(
                                              db,
                                              supplierId,
                                              p.id,
                                              'pending_review'
                                            );
                                            setProducts((prev) =>
                                              prev.map((x) =>
                                                x.id === p.id
                                                  ? {
                                                      ...x,
                                                      approvalStatus: 'pending_review',
                                                      updatedAt: nowIso(),
                                                    }
                                                  : x
                                              )
                                            );
                                          } catch (err) {
                                            console.error(err);
                                            setProductReviewError(
                                              'No se pudo enviar el producto a revisión. Intenta de nuevo.'
                                            );
                                          } finally {
                                            setProductReviewToggleId(null);
                                          }
                                        })();
                                      }}
                                    >
                                      {productReviewToggleId === p.id
                                        ? 'Enviando…'
                                        : 'Enviar a revisión'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.reviewFlowSecondaryBtn}
                                      disabled={
                                        !supplierId ||
                                        productReviewToggleId === p.id ||
                                        productActiveToggleId === p.id
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!supplierId) return;
                                        void (async () => {
                                          setProductReviewError(null);
                                          setProductReviewToggleId(p.id);
                                          try {
                                            await updateSupplierProductReviewStatus(
                                              db,
                                              supplierId,
                                              p.id,
                                              'draft'
                                            );
                                            setProducts((prev) =>
                                              prev.map((x) =>
                                                x.id === p.id
                                                  ? {
                                                      ...x,
                                                      approvalStatus: 'draft',
                                                      updatedAt: nowIso(),
                                                    }
                                                  : x
                                              )
                                            );
                                          } catch (err) {
                                            console.error(err);
                                            setProductReviewError(
                                              'No se pudo volver a borrador. Intenta de nuevo.'
                                            );
                                          } finally {
                                            setProductReviewToggleId(null);
                                          }
                                        })();
                                      }}
                                    >
                                      {productReviewToggleId === p.id
                                        ? 'Guardando…'
                                        : 'Volver a borrador'}
                                    </button>
                                  )
                                ) : null}
                                {p.isActive ? (
                                <button
                                  type="button"
                                  className={styles.dangerGhostBtn}
                                  disabled={
                                    productActiveToggleId === p.id ||
                                    !supplierId ||
                                    productReviewToggleId === p.id
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!supplierId) return;
                                    void (async () => {
                                      setProductActiveError(null);
                                      setProductActiveToggleId(p.id);
                                      try {
                                        await updateSupplierProductActive(db, supplierId, p.id, false);
                                        setProducts((prev) =>
                                          prev.map((x) =>
                                            x.id === p.id ? { ...x, isActive: false, updatedAt: nowIso() } : x
                                          )
                                        );
                                      } catch (err) {
                                        console.error(err);
                                        setProductActiveError('No se pudo desactivar el producto. Intenta de nuevo.');
                                      } finally {
                                        setProductActiveToggleId(null);
                                      }
                                    })();
                                  }}
                                >
                                  Desactivar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  disabled={
                                    productActiveToggleId === p.id ||
                                    !supplierId ||
                                    productReviewToggleId === p.id
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!supplierId) return;
                                    void (async () => {
                                      setProductActiveError(null);
                                      setProductActiveToggleId(p.id);
                                      try {
                                        await updateSupplierProductActive(db, supplierId, p.id, true);
                                        setProducts((prev) =>
                                          prev.map((x) =>
                                            x.id === p.id ? { ...x, isActive: true, updatedAt: nowIso() } : x
                                          )
                                        );
                                      } catch (err) {
                                        console.error(err);
                                        setProductActiveError('No se pudo activar el producto. Intenta de nuevo.');
                                      } finally {
                                        setProductActiveToggleId(null);
                                      }
                                    })();
                                  }}
                                >
                                  Activar
                                </button>
                              )}
                              </div>
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
                      <p className={styles.filterPopoverHelp}>
                        Selecciona una o varias. El producto debe pertenecer al menos a una.
                      </p>
                      <div className={styles.filterPopoverChips} role="group" aria-label="Categorías">
                        {categoriesForProductFilters.length === 0 ? (
                          <span className={styles.filterEmpty}>Sin categorías cargadas</span>
                        ) : (
                          categoriesForProductFilters.map((c) => {
                            const on = productCategoryFilterIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                className={`${styles.filterChip} ${on ? styles.filterChipOn : ''}`}
                                onClick={() =>
                                  setProductCategoryFilterIds((prev) => toggleInList(prev, c.id))
                                }
                              >
                                {c.name}
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
                      <p className={styles.filterPopoverTitle}>Aprobación</p>
                      <div className={styles.filterPopoverChips} role="group" aria-label="Estado de aprobación">
                        {APPROVAL_FILTER_ORDER.map((st) => {
                          const on = productApprovalFilter.includes(st);
                          return (
                            <button
                              key={st}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              className={`${styles.filterChip} ${on ? styles.filterChipOn : ''}`}
                              onClick={() =>
                                setProductApprovalFilter((prev) => toggleInList(prev, st))
                              }
                            >
                              {badgeForApproval(st).label}
                            </button>
                          );
                        })}
                      </div>
                      <p className={styles.filterPopoverTitle}>En catálogo</p>
                      <div className={styles.filterPopoverChips} role="group" aria-label="Activo o inactivo">
                        {(
                          [
                            { key: 'active' as const, label: 'Activo' },
                            { key: 'inactive' as const, label: 'Inactivo' },
                          ] as const
                        ).map(({ key, label }) => {
                          const on = productCatalogFilter.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              className={`${styles.filterChip} ${on ? styles.filterChipOn : ''}`}
                              onClick={() =>
                                setProductCatalogFilter((prev) => toggleInList(prev, key))
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

              {!productsLoading && productsHasMore ? (
                <div className={styles.pagination}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => void loadProductsMore()}
                    disabled={productsLoadingMore}
                  >
                    {productsLoadingMore ? 'Cargando…' : `Cargar ${PRODUCTS_PAGE_SIZE} más`}
                  </button>
                </div>
              ) : null}

              <Drawer
                open={productDrawerOpen}
                title={editingProductId ? 'Editar producto' : 'Nuevo producto'}
                onClose={() => setProductDrawerOpen(false)}
              >
                <ProductEditor
                  initial={productDraft}
                  categories={activeCategories}
                  onCancel={() => setProductDrawerOpen(false)}
                  supplierId={supplierId}
                  supplierIdError={supplierIdError}
                  onSave={async (payload) => {
                    if (!supplierId) throw new Error(supplierIdError ?? 'supplierId no disponible.');
                    await saveSupplierProduct(db, storage, supplierId, payload);
                    await loadProductsFirstPage();
                    setProductDrawerOpen(false);
                  }}
                />
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

function ProductEditor({
  initial,
  categories,
  onCancel,
  onSave,
  supplierId,
  supplierIdError,
}: {
  initial: ProductDraft | null;
  categories: CategoryDraft[];
  onCancel: () => void;
  onSave: (payload: {
    id?: Id;
    name: string;
    description: string;
    price: MoneyUSD;
    discountUsd: number;
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
    if (!initial && categoryIds.length === 0 && categories.length > 0) {
      setCategoryIds([categories[0]!.id]);
    }
  }, [initial, categoryIds.length, categories]);

  const canSave =
    name.trim().length > 0 && categoryIds.length > 0 && price >= 0 && discountLeavesPositiveFinal;

  const approval = initial ? badgeForApproval(initial.approvalStatus) : badgeForApproval('draft');

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
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <div className={styles.bannerTitle}>Visibilidad</div>
          <div className={styles.bannerText}>
            Este producto será visible en el marketplace móvil solo después de la aprobación del administrador.
          </div>
        </div>
        <div className={styles.bannerRight}>
          <Pill tone={approval.tone}>{approval.label}</Pill>
        </div>
      </div>

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
        <label className={`${styles.label} ${styles.pricingL1}`}>Precio (USD)</label>
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
              Equivale aprox. a <strong>{formatUsd(discountUsdEffective)}</strong> de descuento.
            </div>
          )}
          {priceNum > 0 && !discountLeavesPositiveFinal ? (
            <p className={styles.errorInline} role="alert">
              El descuento debe dejar un precio final mayor que cero.
            </p>
          ) : null}
        </div>
        <div className={`${styles.readonlyBox} ${styles.pricingI3}`}>
          {formatUsd(Math.max(0, Number(price || 0) - discountUsdEffective))}
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
            Crea grupos obligatorios de una sola opción y complementos opcionales de varias selecciones. Los ítems pueden tener costo extra.
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
                isActive: true,
                items: [{ id: uid('oi'), label: 'Nueva opción', priceDeltaUsd: 0, isActive: true }],
              },
            ])
          }
        >
          + Agregar grupo
        </button>
      </div>

      {optionGroups.filter((g) => g.isActive).length === 0 ? (
        <div className={styles.miniEmpty}>
          Aún no hay grupos de opciones. Agrega uno si tu producto tiene variantes o complementos.
        </div>
      ) : (
        <div className={styles.optionGroups}>
          {optionGroups
            .filter((g) => g.isActive)
            .map((g) => (
              <OptionGroupEditor
                key={g.id}
                group={g}
                onChange={(next) =>
                  setOptionGroups((prev) => prev.map((x) => (x.id === g.id ? next : x)))
                }
                onDisable={() => setOptionGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, isActive: false } : x)))}
              />
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
                      {g.selection === 'single' ? 'Una opción' : 'Varias opciones'} ·{' '}
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
                onChange={(e) => {
                  const required = e.target.checked;
                  // Regla de UX: si es obligatorio, debe ser "Una opción" (no múltiples).
                  const selection = required ? 'single' : group.selection;
                  onChange({ ...group, required, selection });
                }}
              />
              <span>Obligatorio</span>
            </label>
            <div className={styles.segment}>
              <button
                type="button"
                className={`${styles.segmentBtn} ${group.selection === 'single' ? styles.segmentBtnActive : ''}`}
                onClick={() => onChange({ ...group, selection: 'single' })}
              >
                Una opción
              </button>
              <button
                type="button"
                className={`${styles.segmentBtn} ${group.selection === 'multi' ? styles.segmentBtnActive : ''}`}
                onClick={() => onChange({ ...group, selection: 'multi' })}
                disabled={group.required}
                title={group.required ? 'Si es obligatorio, solo puede ser una opción.' : undefined}
              >
                Varias opciones
              </button>
            </div>
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
            <div key={it.id} className={styles.optionItemRow}>
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
                <span className={styles.deltaPrefix}>+ USD</span>
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
                  aria-label="Costo extra en USD"
                />
              </div>
              <button
                type="button"
                className={styles.dangerGhostBtn}
                onClick={() => onChange({ ...group, items: group.items.map((x) => (x.id === it.id ? { ...x, isActive: false } : x)) })}
                aria-label={`Eliminar opción ${it.label}`}
                title="Eliminar"
              >
                <DeleteOutlineIcon sx={{ fontSize: 20 }} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.optionGroupFooter}>
        <span className={styles.muted}>
          En app móvil: {group.required ? 'debe elegir' : 'puede omitir'} • {group.selection === 'single' ? 'elige 1' : 'elige ninguno o varios'}
        </span>
      </div>
    </div>
  );
}

