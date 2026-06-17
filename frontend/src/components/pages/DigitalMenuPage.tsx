'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ViewCarouselOutlinedIcon from '@mui/icons-material/ViewCarouselOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import { listCategories, listProducts, updateCategory, updateOptionGroup, updateOptionItem } from '@/lib/api/menu';
import { fetchAllPages } from '@/lib/api/pagination';
import { listAllPromotions } from '@/lib/api/promotions';
import { getRestaurant, updateRestaurant } from '@/lib/api/restaurants';
import {
  ApiError,
  type Category,
  type CategoryDisplayLayout,
  type OptionGroup,
  type Product,
  type Promotion,
  type Restaurant,
} from '@/lib/api/types';
import {
  buildMenuProductDiscountMap,
  type MenuProductDiscountInfo,
} from '@/lib/promotions/menuProductDiscount';
import { arrayMove } from '@/lib/arrayMove';
import { formatMoney } from '@/lib/currency';
import { attachDragOverlay } from '@/lib/dragOverlay';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { uploadRestaurantAsset } from '@/lib/storage/upload';
import { DigitalMenuProductDetail } from '@/components/digital-menu/DigitalMenuProductDetail';
import { DigitalMenuThemePicker } from '@/components/digital-menu/DigitalMenuThemePicker';
import {
  DEFAULT_DIGITAL_MENU_THEME_ID,
  digitalMenuThemeToStyle,
  getDigitalMenuThemeOrDefault,
  loadDigitalMenuThemeFonts,
} from '@/lib/digital-menu/themes';
import { useAuth } from '@/hooks/useAuth';
import { resolveSupplierIdByEmail } from '@/services/db';
import { legacyDb as db } from '@/services/legacyDb';
import styles from './DigitalMenuPage.module.css';

const LAYOUTS: CategoryDisplayLayout[] = ['vertical', 'horizontal', 'grid'];
const COVER_HEIGHT = 168;
const PINNED_BAR_HEIGHT = 48;
const THEME_STORAGE_KEY = 'venddelo-digital-menu-theme-id';

function pickRandomLayout(): CategoryDisplayLayout {
  return LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)]!;
}

function sortCategories(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name));
}

function productsForCategory(products: Product[], categoryId: string): Product[] {
  return products.filter(
    (p) => p.is_active && p.category_ids.includes(categoryId),
  );
}

function ProductThumb({ product, className }: { product: Product; className?: string }) {
  const url = storagePublicUrl(product.image_path);
  if (url) {
    return <img src={url} alt={product.name} className={className} />;
  }
  return <div className={className} aria-hidden />;
}

function ProductPrice({
  product,
  discount,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
}) {
  const originalPrice = product.price_cents / 100;
  const hasPriceDiscount = discount != null && discount.amountOff > 0;

  if (!hasPriceDiscount && !discount?.badge) {
    return (
      <div className={styles.productPrice}>
        {formatMoney(originalPrice, product.currency)}
      </div>
    );
  }

  return (
    <div className={styles.productPriceRow}>
      {hasPriceDiscount ? (
        <>
          <span className={styles.productPriceOriginal}>
            {formatMoney(originalPrice, product.currency)}
          </span>
          <span className={styles.productPriceSale}>
            {formatMoney(discount.finalPrice, product.currency)}
          </span>
        </>
      ) : (
        <span className={styles.productPrice}>
          {formatMoney(originalPrice, product.currency)}
        </span>
      )}
      {discount?.badge ? (
        <span className={styles.productDiscountBadge}>{discount.badge}</span>
      ) : null}
    </div>
  );
}

function ProductCardContent({
  product,
  discount,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
}) {
  return (
    <>
      <div className={styles.productName}>{product.name}</div>
      {product.description ? (
        <div className={styles.productDesc}>{product.description}</div>
      ) : null}
      <ProductPrice product={product} discount={discount} />
    </>
  );
}

function ProductList({
  layout,
  products,
  productDiscounts,
  onProductClick,
}: {
  layout: CategoryDisplayLayout;
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  onProductClick: (productId: string) => void;
}) {
  if (products.length === 0) {
    return <div className={styles.emptyProducts}>Sin productos en esta categoría</div>;
  }

  if (layout === 'horizontal') {
    return (
      <div className={styles.productsHorizontal}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={`${styles.productCardH} ${styles.productTapTarget}`}
            onClick={() => onProductClick(product.id)}
            aria-label={`Ver ${product.name}`}
          >
            <ProductThumb product={product} className={styles.productThumb} />
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
            />
          </button>
        ))}
      </div>
    );
  }

  if (layout === 'grid') {
    return (
      <div className={styles.productsGrid}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={`${styles.productCardG} ${styles.productTapTarget}`}
            onClick={() => onProductClick(product.id)}
            aria-label={`Ver ${product.name}`}
          >
            <ProductThumb product={product} className={styles.productThumb} />
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.productsVertical}>
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          className={`${styles.productRow} ${styles.productTapTarget}`}
          onClick={() => onProductClick(product.id)}
          aria-label={`Ver ${product.name}`}
        >
          <div className={styles.productRowBody}>
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
            />
          </div>
          <ProductThumb product={product} className={styles.productThumb} />
        </button>
      ))}
    </div>
  );
}

export default function DigitalMenuPage() {
  const { firebaseUser, accessToken, loading: authLoading } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dropCategoryId, setDropCategoryId] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const phoneScrollRef = useRef<HTMLDivElement>(null);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [themeId, setThemeId] = useState(DEFAULT_DIGITAL_MENU_THEME_ID);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productHeroCollapsed, setProductHeroCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored) setThemeId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const menuTheme = useMemo(() => getDigitalMenuThemeOrDefault(themeId), [themeId]);
  const menuThemeStyle = useMemo(() => digitalMenuThemeToStyle(menuTheme), [menuTheme]);

  useEffect(() => {
    loadDigitalMenuThemeFonts(menuTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      /* ignore */
    }
  }, [menuTheme, themeId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading) return;

      if (!accessToken) {
        setLoadError('No hay sesión activa. Inicia sesión de nuevo.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const resolved = await resolveSupplierIdByEmail(
          db,
          firebaseUser?.email ?? '',
          accessToken,
        );
        if ('error' in resolved) {
          if (!cancelled) {
            setLoadError(resolved.error);
            setLoading(false);
          }
          return;
        }

        const rid = resolved.supplierId;
        const [restaurantData, categoryRows, productRows, promotionRows] = await Promise.all([
          getRestaurant(accessToken, rid),
          fetchAllPages((cursor) => listCategories(accessToken, rid, 100, cursor)),
          fetchAllPages((cursor) => listProducts(accessToken, rid, 100, cursor)),
          listAllPromotions(accessToken, rid),
        ]);

        const layoutUpdates: Promise<Category>[] = [];
        const normalizedCategories = sortCategories(categoryRows).map((cat) => {
          if (!cat.display_layout) {
            const layout = pickRandomLayout();
            layoutUpdates.push(
              updateCategory(accessToken, rid, cat.id, { display_layout: layout }),
            );
            return { ...cat, display_layout: layout };
          }
          return cat;
        });

        if (layoutUpdates.length > 0) {
          await Promise.all(layoutUpdates);
        }

        if (cancelled) return;

        setRestaurantId(rid);
        setRestaurant(restaurantData);
        setCategories(normalizedCategories);
        setProducts(productRows);
        setPromotions(promotionRows);
        setActiveCategoryId(normalizedCategories[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.code === 'network_error') {
            setLoadError(error.message);
          } else {
            console.error(error);
            setLoadError('No se pudo cargar el menú digital.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, firebaseUser?.email]);

  const productDiscounts = useMemo(
    () => buildMenuProductDiscountMap(products, promotions),
    [products, promotions],
  );

  const persistCategoryOrder = useCallback(
    async (ordered: Category[]) => {
      if (!accessToken || !restaurantId) return;
      const updates = ordered.map((cat, index) =>
        updateCategory(accessToken, restaurantId, cat.id, { sort_index: index }),
      );
      await Promise.all(updates);
    },
    [accessToken, restaurantId],
  );

  const handleCategoryDrop = useCallback(
    async (targetId: string) => {
      if (!dragCategoryId || dragCategoryId === targetId) {
        setDragCategoryId(null);
        setDropCategoryId(null);
        return;
      }

      const from = categories.findIndex((c) => c.id === dragCategoryId);
      const to = categories.findIndex((c) => c.id === targetId);
      if (from < 0 || to < 0) return;

      const reordered = sortCategories(
        arrayMove(categories, from, to).map((cat, index) => ({ ...cat, sort_index: index })),
      );
      setCategories(reordered);
      setDragCategoryId(null);
      setDropCategoryId(null);

      try {
        await persistCategoryOrder(reordered);
      } catch (error) {
        console.error(error);
      }
    },
    [categories, dragCategoryId, persistCategoryOrder],
  );

  const handleLayoutChange = useCallback(
    async (categoryId: string, layout: CategoryDisplayLayout) => {
      if (!accessToken || !restaurantId) return;
      setCategories((prev) =>
        prev.map((cat) => (cat.id === categoryId ? { ...cat, display_layout: layout } : cat)),
      );
      try {
        await updateCategory(accessToken, restaurantId, categoryId, { display_layout: layout });
      } catch (error) {
        console.error(error);
      }
    },
    [accessToken, restaurantId],
  );

  const handleNameBlur = useCallback(
    async (value: string) => {
      if (!accessToken || !restaurantId || !restaurant) return;
      const trimmed = value.trim();
      if (!trimmed || trimmed === restaurant.name) return;
      setSavingName(true);
      try {
        const updated = await updateRestaurant(accessToken, restaurantId, { name: trimmed });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
      } finally {
        setSavingName(false);
      }
    },
    [accessToken, restaurant, restaurantId],
  );

  const handleAssetUpload = useCallback(
    async (folder: 'logo' | 'cover', file: File) => {
      if (!accessToken || !restaurantId) return;
      try {
        const path = await uploadRestaurantAsset(accessToken, restaurantId, folder, file);
        const field = folder === 'logo' ? 'logo_path' : 'cover_path';
        const updated = await updateRestaurant(accessToken, restaurantId, { [field]: path });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
      }
    },
    [accessToken, restaurantId],
  );

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategoryId(categoryId);
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handlePhoneScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = phoneScrollRef.current;
      if (!el) return;
      setScrollY(el.scrollTop);
    });
  }, []);

  useEffect(() => {
    setHeroCollapsed(false);
    setScrollY(0);
    if (phoneScrollRef.current) phoneScrollRef.current.scrollTop = 0;
  }, [restaurant?.id]);

  useEffect(() => {
    const root = phoneScrollRef.current;
    const sentinel = heroSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeroCollapsed(!entry.isIntersecting);
      },
      {
        root,
        threshold: 0,
        rootMargin: `-${PINNED_BAR_HEIGHT}px 0px 0px 0px`,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [restaurant?.id, loading]);

  const logoUrl = useMemo(() => storagePublicUrl(restaurant?.logo_path), [restaurant?.logo_path]);
  const coverUrl = useMemo(() => storagePublicUrl(restaurant?.cover_path), [restaurant?.cover_path]);
  const showFloatControls = !heroCollapsed && scrollY < COVER_HEIGHT * 0.55;

  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [products, selectedProductId],
  );

  const openProduct = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setProductHeroCollapsed(false);
    if (phoneScrollRef.current) phoneScrollRef.current.scrollTop = 0;
  }, []);

  const closeProduct = useCallback(() => {
    setSelectedProductId(null);
    setProductHeroCollapsed(false);
  }, []);

  const handleProductHeroCollapsedChange = useCallback((collapsed: boolean) => {
    setProductHeroCollapsed(collapsed);
  }, []);

  const handleReorderOptionGroups = useCallback(
    async (reordered: OptionGroup[]) => {
      if (!accessToken || !restaurantId || !selectedProductId) return;

      let previous: Product[] = [];
      setProducts((prev) => {
        previous = prev;
        return prev.map((product) =>
          product.id === selectedProductId
            ? { ...product, option_groups: reordered }
            : product,
        );
      });

      try {
        const activeGroups = reordered.filter((group) => group.is_active);
        await Promise.all(
          activeGroups.map((group, index) =>
            updateOptionGroup(accessToken, restaurantId, selectedProductId, group.id, {
              sort_index: index,
            }),
          ),
        );
      } catch (error) {
        console.error(error);
        setProducts(previous);
      }
    },
    [accessToken, restaurantId, selectedProductId],
  );

  const handleReorderOptionItems = useCallback(
    async (groupId: string, reorderedGroup: OptionGroup) => {
      if (!accessToken || !restaurantId || !selectedProductId) return;

      let previous: Product[] = [];
      setProducts((prev) => {
        previous = prev;
        return prev.map((product) => {
          if (product.id !== selectedProductId) return product;
          return {
            ...product,
            option_groups: product.option_groups.map((group) =>
              group.id === groupId ? reorderedGroup : group,
            ),
          };
        });
      });

      try {
        const activeItems = reorderedGroup.items.filter((item) => item.is_active);
        await Promise.all(
          activeItems.map((item, index) =>
            updateOptionItem(
              accessToken,
              restaurantId,
              selectedProductId,
              groupId,
              item.id,
              { sort_index: index },
            ),
          ),
        );
      } catch (error) {
        console.error(error);
        setProducts(previous);
      }
    },
    [accessToken, restaurantId, selectedProductId],
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Menú Digital</h1>
          <p className={styles.subtitle}>Vista previa de cómo ven tus clientes el menú</p>
        </div>
        <p className={styles.loading}>Cargando vista previa…</p>
      </div>
    );
  }

  if (loadError || !restaurant) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Menú Digital</h1>
          <p className={styles.subtitle}>Vista previa de cómo ven tus clientes el menú</p>
        </div>
        <p className={styles.error}>{loadError ?? 'No se encontró el restaurante.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Menú Digital</h1>
        <p className={styles.subtitle}>
          Personaliza portada, logo, nombre, orden de categorías y cómo se muestran los productos
        </p>
      </div>

      <div className={styles.previewLayout}>
        <div className={styles.themePanelWrap}>
          <DigitalMenuThemePicker value={themeId} onChange={setThemeId} />
        </div>

        <div className={styles.previewShell}>
          <div
            className={styles.phone}
            style={menuThemeStyle}
            data-cat-tabs={menuTheme.style.categoryTabStyle}
          >
            {selectedProduct ? (
              <header
                className={`${styles.compactHeader} ${
                  productHeroCollapsed ? styles.compactHeaderVisible : ''
                }`}
                aria-hidden={!productHeroCollapsed}
              >
                <button
                  type="button"
                  className={styles.compactIconBtn}
                  aria-label="Volver al menú"
                  onClick={closeProduct}
                >
                  <ArrowBackIcon fontSize="small" />
                </button>
                <span className={styles.compactTitle}>{selectedProduct.name}</span>
              </header>
            ) : (
            <header
              className={`${styles.compactHeader} ${heroCollapsed ? styles.compactHeaderVisible : ''}`}
              aria-hidden={!heroCollapsed}
            >
              <span className={styles.compactTitle}>{restaurant.name}</span>
              <div className={styles.headerActions}>
                <span className={styles.compactIconBtn} aria-label="Compartir">
                  <IosShareOutlinedIcon fontSize="small" />
                </span>
                <span className={styles.compactIconBtn} aria-label="Buscar">
                  <SearchOutlinedIcon fontSize="small" />
                </span>
              </div>
            </header>
            )}

            <div
              ref={phoneScrollRef}
              className={`${styles.phoneScroll} ${selectedProduct ? styles.phoneScrollDetail : ''}`}
              onScroll={selectedProduct ? undefined : handlePhoneScroll}
            >
              {selectedProduct ? (
                <DigitalMenuProductDetail
                  product={selectedProduct}
                  discount={productDiscounts.get(selectedProduct.id)}
                  heroCollapsed={productHeroCollapsed}
                  onHeroCollapsedChange={handleProductHeroCollapsedChange}
                  scrollRootRef={phoneScrollRef}
                  onBack={closeProduct}
                  onReorderGroups={handleReorderOptionGroups}
                  onReorderItems={handleReorderOptionItems}
                />
              ) : (
              <>
              <section className={styles.menuHero} aria-label="Información del restaurante">
              <div className={styles.coverWrap}>
              {coverUrl ? (
                <img src={coverUrl} alt="" className={styles.coverImage} />
              ) : (
                <div className={styles.coverPlaceholder}>Agregar foto de portada</div>
              )}
              <div className={styles.coverScrim} aria-hidden />
              <div
                className={styles.coverFloatBar}
                data-visible={showFloatControls ? 'true' : 'false'}
                aria-hidden={!showFloatControls}
              >
                <div className={styles.headerActions}>
                  <span className={styles.floatIconBtn} aria-label="Compartir">
                    <IosShareOutlinedIcon fontSize="small" />
                  </span>
                  <span className={styles.floatIconBtn} aria-label="Buscar">
                    <SearchOutlinedIcon fontSize="small" />
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={styles.coverEdit}
                onClick={() => coverInputRef.current?.click()}
              >
                {coverUrl ? 'Cambiar portada' : 'Subir portada'}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAssetUpload('cover', file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className={styles.restaurantHeader}>
              <div className={styles.logoRow}>
                <div className={styles.logoWrap}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className={styles.logoImage} />
                  ) : (
                    <div className={styles.logoPlaceholder}>
                      {(restaurant.name.trim()[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.logoEdit}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAssetUpload('logo', file);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div className={styles.nameBlock}>
                  <input
                    className={styles.restaurantName}
                    defaultValue={restaurant.name}
                    key={restaurant.id + restaurant.name}
                    aria-label="Nombre del restaurante"
                    onBlur={(e) => void handleNameBlur(e.target.value)}
                  />
                  <div className={styles.nameHint}>
                    {savingName ? 'Guardando…' : 'Toca el nombre para editarlo'}
                  </div>
                </div>
              </div>
              {restaurant.address ? (
                <div className={styles.addressLine}>{restaurant.address}</div>
              ) : null}
              <div ref={heroSentinelRef} className={styles.heroSentinel} aria-hidden />
            </div>
              </section>

            {categories.length === 0 ? (
              <div className={styles.emptyCategories}>
                Crea categorías en Productos para ver tu menú aquí
              </div>
            ) : (
              <>
                <div
                  className={`${styles.categoryBar} ${heroCollapsed ? styles.categoryBarPinned : ''}`}
                >
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className={`${styles.categoryTab} ${
                        activeCategoryId === cat.id ? styles.categoryTabActive : ''
                      } ${dragCategoryId === cat.id ? styles.categoryTabDragging : ''} ${
                        dropCategoryId === cat.id && dragCategoryId !== cat.id
                          ? styles.categoryTabDropTarget
                          : ''
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragCategoryId && dragCategoryId !== cat.id) {
                          setDropCategoryId(cat.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dropCategoryId === cat.id) setDropCategoryId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleCategoryDrop(cat.id);
                      }}
                    >
                      <button
                        type="button"
                        className={styles.dragHandle}
                        draggable
                        aria-label={`Reordenar categoría ${cat.name}`}
                        title="Arrastrar para reordenar"
                        onDragStart={(e) => {
                          const tab = (e.currentTarget as HTMLElement).closest(
                            `.${styles.categoryTab}`,
                          );
                          if (tab instanceof HTMLElement) {
                            attachDragOverlay(e, tab, {
                              offsetX: 24,
                              offsetY: 20,
                              overlayClassName: styles.dragOverlayClone,
                              bodyDraggingClassName: styles.bodyDragging,
                            });
                          }
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', cat.id);
                          setDragCategoryId(cat.id);
                        }}
                        onDragEnd={() => {
                          setDragCategoryId(null);
                          setDropCategoryId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DragIndicatorIcon sx={{ fontSize: 16 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollToCategory(cat.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          font: 'inherit',
                          color: 'inherit',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {cat.name}
                      </button>
                    </div>
                  ))}
                </div>

                {categories.map((cat) => {
                  const layout = cat.display_layout ?? 'vertical';
                  const catProducts = productsForCategory(products, cat.id);
                  return (
                    <section
                      key={cat.id}
                      id={`menu-section-${cat.id}`}
                      ref={(el) => {
                        sectionRefs.current[cat.id] = el;
                      }}
                      className={styles.section}
                    >
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>{cat.name}</h2>
                        <div className={styles.layoutPicker} role="group" aria-label="Vista de productos">
                          <button
                            type="button"
                            className={`${styles.layoutBtn} ${
                              layout === 'vertical' ? styles.layoutBtnActive : ''
                            }`}
                            title="Lista vertical"
                            onClick={() => void handleLayoutChange(cat.id, 'vertical')}
                          >
                            <ViewListOutlinedIcon sx={{ fontSize: 18 }} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.layoutBtn} ${
                              layout === 'horizontal' ? styles.layoutBtnActive : ''
                            }`}
                            title="Lista horizontal"
                            onClick={() => void handleLayoutChange(cat.id, 'horizontal')}
                          >
                            <ViewCarouselOutlinedIcon sx={{ fontSize: 18 }} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.layoutBtn} ${
                              layout === 'grid' ? styles.layoutBtnActive : ''
                            }`}
                            title="Cuadrícula"
                            onClick={() => void handleLayoutChange(cat.id, 'grid')}
                          >
                            <GridViewOutlinedIcon sx={{ fontSize: 18 }} />
                          </button>
                        </div>
                      </div>
                      <ProductList
                        layout={layout}
                        products={catProducts}
                        productDiscounts={productDiscounts}
                        onProductClick={openProduct}
                      />
                    </section>
                  );
                })}
              </>
            )}
              </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
