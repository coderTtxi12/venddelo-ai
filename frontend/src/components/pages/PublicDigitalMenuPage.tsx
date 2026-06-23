'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { DigitalMenuCategorySections } from '@/components/digital-menu/DigitalMenuCategorySections';
import { DigitalMenuProductDetail } from '@/components/digital-menu/DigitalMenuProductDetail';
import { PromotionShortcutProductsView } from '@/components/digital-menu/PromotionShortcutProductsView';
import { PublicDesktopMenuLayout } from '@/components/digital-menu/PublicDesktopMenuLayout';
import { PublicMenuCart } from '@/components/digital-menu/PublicMenuCart';
import { PublicMenuCartBar } from '@/components/digital-menu/PublicMenuCartBar';
import { PublicMenuSearch } from '@/components/digital-menu/PublicMenuSearch';
import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';
import {
  sortCategories,
} from '@/components/digital-menu/menuProductUi';
import { RestaurantHoursDisplay } from '@/components/digital-menu/RestaurantHoursDisplay';
import { RestaurantLocationSection } from '@/components/digital-menu/RestaurantLocationSection';
import { RestaurantOpenStatusBadge } from '@/components/digital-menu/RestaurantOpenStatusBadge';
import { RestaurantServiceChips } from '@/components/digital-menu/RestaurantServiceChips';
import {
  getPublicMenu,
  getPublicRestaurant,
  getPublicRestaurantPromotions,
  getPublicRestaurantSchedules,
  type PublicPromotionsContext,
  type PublicRestaurant,
} from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import { buildMenuProductDiscountMap } from '@/lib/promotions/menuProductDiscount';
import {
  buildDigitalMenuDisplayCategories,
  digitalMenuSpecialCategoryConfigFromRestaurant,
} from '@/lib/digital-menu/specialCategories';
import { readPromotionsCache, writePromotionsCache } from '@/lib/promotions/publicPromotionsCache';
import { getBundleComplementRulesForProduct } from '@/lib/promotions/bundlePromoEligibility';
import { listLivePromotionShortcuts } from '@/lib/promotions/promotionShortcuts';
import {
  buildProductTimeLimitedPromotionMap,
  type PromotionCountdownContext,
} from '@/lib/promotions/promotionCountdown';
import {
  DEFAULT_DIGITAL_MENU_THEME_ID,
  digitalMenuThemeToStyle,
  getDigitalMenuThemeOrDefault,
  loadDigitalMenuThemeFonts,
} from '@/lib/digital-menu/themes';
import { PUBLIC_MENU_SCHEDULE_SERVICE_TYPES, resolveRestaurantServices } from '@/lib/restaurantServices';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { buildAddToCartInput } from '@/lib/digital-menu/cart/buildCartLine';
import { triggerHaptic } from '@/lib/haptics/triggerHaptic';
import { scrollCategoryTabIntoView, getCategoryScrollAnchorPosition, getSectionOffsetTop } from '@/lib/digital-menu/categoryScrollSpy';
import { cartSubtotalCents as sumCartSubtotalCents } from '@/lib/digital-menu/cart/cartMath';
import { usePublicMenuCart } from '@/lib/digital-menu/cart/usePublicMenuCart';
import { useCategoryScrollSpy } from '@/lib/digital-menu/useCategoryScrollSpy';
import {
  DIGITAL_MENU_COVER_HEIGHT_PX,
  DIGITAL_MENU_PINNED_BAR_HEIGHT_PX,
  getPublicMenuViewportBand,
  type PublicMenuViewportBand,
} from '@/lib/digital-menu/layout';
import menuStyles from './DigitalMenuPage.module.css';
import styles from './PublicDigitalMenuPage.module.css';

const COVER_HEIGHT = DIGITAL_MENU_COVER_HEIGHT_PX;
const PINNED_BAR_HEIGHT = DIGITAL_MENU_PINNED_BAR_HEIGHT_PX;

function CartHeaderButton({
  itemCount,
  onClick,
  variant,
}: {
  itemCount: number;
  onClick: () => void;
  variant: 'compact' | 'float';
}) {
  const className =
    variant === 'float'
      ? `${menuStyles.floatIconBtn} ${styles.cartHeaderBtn} ${styles.productFixedCart}`
      : `${menuStyles.compactIconBtn} ${styles.cartHeaderBtn}`;

  return (
    <button
      type="button"
      className={className}
      aria-label={
        itemCount > 0 ? `Ver carrito, ${itemCount} artículos` : 'Ver carrito'
      }
      onClick={onClick}
    >
      <ShoppingBagOutlinedIcon fontSize="small" />
      {itemCount > 0 ? (
        <span className={styles.cartHeaderBadge} aria-hidden>
          {itemCount}
        </span>
      ) : null}
    </button>
  );
}

type PublicDigitalMenuPageProps = {
  subdomain: string;
};

export default function PublicDigitalMenuPage({ subdomain }: PublicDigitalMenuPageProps) {
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const mobileScrollRafRef = useRef<number | null>(null);
  const pendingDesktopCategoryScrollRef = useRef<string | null>(null);
  const [viewportBand, setViewportBand] = useState<PublicMenuViewportBand>('mobile');
  const isDesktopLayout = viewportBand === 'desktop';
  const isTabletLayout = viewportBand === 'tablet';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<PublicRestaurant | null>(null);
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof getPublicMenu>>['categories']>([]);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof getPublicMenu>>['products']>([]);
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof getPublicRestaurantSchedules>>>([]);
  const [promotionsContext, setPromotionsContext] = useState<PublicPromotionsContext | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null);
  const [productHeroCollapsed, setProductHeroCollapsed] = useState(false);
  const [promotionHeroCollapsed, setPromotionHeroCollapsed] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const cart = usePublicMenuCart(subdomain);

  const validProductIds = useMemo(
    () => new Set(products.map((product) => product.id)),
    [products],
  );

  useEffect(() => {
    if (validProductIds.size === 0) return;
    cart.pruneInvalidLines(validProductIds);
  }, [cart.pruneInvalidLines, validProductIds]);

  const cartSubtotalCents = useMemo(() => sumCartSubtotalCents(cart.lines), [cart.lines]);
  const promotionTimezone = promotionsContext?.timezone ?? restaurant?.timezone ?? 'America/Mexico_City';

  const themeId = restaurant?.digital_menu_theme_id ?? DEFAULT_DIGITAL_MENU_THEME_ID;
  const menuTheme = useMemo(() => getDigitalMenuThemeOrDefault(themeId), [themeId]);
  const menuThemeStyle = useMemo(() => digitalMenuThemeToStyle(menuTheme), [menuTheme]);
  const enabledServices = useMemo(
    () => (restaurant ? resolveRestaurantServices(restaurant) : []),
    [restaurant],
  );

  useEffect(() => {
    loadDigitalMenuThemeFonts(menuTheme);
  }, [menuTheme]);

  useEffect(() => {
    const syncViewport = () => setViewportBand(getPublicMenuViewportBand(window.innerWidth));
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    sectionRefs.current = {};
  }, [isDesktopLayout]);

  useEffect(() => {
    const cachedPromotions = readPromotionsCache(subdomain);
    if (cachedPromotions) {
      setPromotionsContext(cachedPromotions);
    }
  }, [subdomain]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const [restaurantData, menuData, scheduleRows, promotionContext] = await Promise.all([
          getPublicRestaurant(subdomain),
          getPublicMenu(subdomain),
          getPublicRestaurantSchedules(subdomain),
          getPublicRestaurantPromotions(subdomain),
        ]);

        if (cancelled) return;

        const sortedCategories = sortCategories(menuData.categories);
        setRestaurant(restaurantData);
        setCategories(sortedCategories);
        setProducts(menuData.products);
        setSchedules(scheduleRows);
        setPromotionsContext(promotionContext);
        writePromotionsCache(subdomain, promotionContext);
        setActiveCategoryId(sortedCategories[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError) {
            if (error.code === 'network_error') {
              setLoadError(
                'No se pudo conectar con el servidor. Verifica que el backend esté en marcha (puerto 8080).',
              );
            } else if (error.httpStatus === 404) {
              setLoadError('No encontramos un menú público con ese subdominio.');
            } else {
              setLoadError(error.message || 'No se pudo cargar el menú. Inténtalo de nuevo.');
            }
          } else {
            console.error(error);
            setLoadError('No se pudo cargar el menú. Inténtalo de nuevo.');
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
  }, [subdomain]);

  const effectiveNow = useMemo(
    () => new Date(promotionsContext?.server_now ?? restaurant?.server_now ?? Date.now()),
    [promotionsContext?.server_now, restaurant?.server_now],
  );

  const productDiscounts = useMemo(
    () =>
      buildMenuProductDiscountMap(
        products,
        promotionsContext?.items ?? [],
        effectiveNow,
        promotionTimezone,
      ),
    [products, promotionsContext, effectiveNow, promotionTimezone],
  );

  const promotionCountdownContext = useMemo<PromotionCountdownContext>(
    () => ({
      schedules,
      enabledServices,
    }),
    [schedules, enabledServices],
  );

  const productTimeLimitedPromotions = useMemo(
    () =>
      buildProductTimeLimitedPromotionMap(
        products,
        promotionsContext?.items ?? [],
        effectiveNow,
        promotionTimezone,
        promotionCountdownContext,
      ),
    [products, promotionsContext?.items, effectiveNow, promotionTimezone, promotionCountdownContext],
  );

  const promotionShortcuts = useMemo(
    () =>
      listLivePromotionShortcuts(
        promotionsContext?.items ?? [],
        products,
        effectiveNow,
        promotionTimezone,
      ),
    [promotionsContext?.items, products, effectiveNow, promotionTimezone],
  );

  const specialCategoryConfig = useMemo(
    () => digitalMenuSpecialCategoryConfigFromRestaurant(restaurant),
    [restaurant],
  );

  const displayCategories = useMemo(
    () =>
      buildDigitalMenuDisplayCategories(categories, {
        config: specialCategoryConfig,
        restaurantId: restaurant?.subdomain ?? 'public',
        hasPromotionShortcuts: promotionShortcuts.length > 0,
        hasLimitedTimeProducts: productDiscounts.size > 0,
      }),
    [
      categories,
      specialCategoryConfig,
      restaurant?.subdomain,
      promotionShortcuts.length,
      productDiscounts.size,
    ],
  );

  const categoryIds = useMemo(() => displayCategories.map((cat) => cat.id), [displayCategories]);

  useEffect(() => {
    if (displayCategories.length === 0) return;
    setActiveCategoryId((current) => {
      if (current && displayCategories.some((category) => category.id === current)) {
        return current;
      }
      return displayCategories[0]?.id ?? null;
    });
  }, [displayCategories]);

  const mobileScrollSpyEnabled =
    !isDesktopLayout &&
    !selectedProductId &&
    !selectedPromotionId &&
    !showCart &&
    categoryIds.length > 0 &&
    !loading;

  const { lockScrollSpy: lockMobileScrollSpy } = useCategoryScrollSpy({
    enabled: mobileScrollSpyEnabled,
    categoryIds,
    sectionRefs,
    scrollRootRef: mobileScrollRef,
    categoryBarRef,
    heroCollapsed,
    pinnedBarHeight: PINNED_BAR_HEIGHT,
    activeCategoryId,
    onActiveCategoryChange: setActiveCategoryId,
  });

  const desktopScrollSpyEnabled =
    isDesktopLayout &&
    !selectedProductId &&
    !selectedPromotionId &&
    !showCart &&
    categoryIds.length > 0 &&
    !loading;

  const { lockScrollSpy: lockDesktopScrollSpy } = useCategoryScrollSpy({
    enabled: desktopScrollSpyEnabled,
    categoryIds,
    sectionRefs,
    scrollRootRef: desktopScrollRef,
    heroCollapsed: false,
    pinnedBarHeight: 0,
    anchorBarHeight: 88,
    activeCategoryId,
    onActiveCategoryChange: setActiveCategoryId,
  });

  const scrollToCategory = useCallback(
    (categoryId: string) => {
      setActiveCategoryId(categoryId);
      if (isDesktopLayout) lockDesktopScrollSpy();
      else lockMobileScrollSpy();

      const section = sectionRefs.current[categoryId];
      const root = isDesktopLayout ? desktopScrollRef.current : mobileScrollRef.current;
      if (!section || !root) return;

      const categoryBarHeight = categoryBarRef.current?.offsetHeight ?? 52;
      const anchorPosition = getCategoryScrollAnchorPosition(root, {
        categoryBar: isDesktopLayout ? null : categoryBarRef.current,
        heroCollapsed: isDesktopLayout ? false : heroCollapsed,
        pinnedBarHeight: PINNED_BAR_HEIGHT,
        categoryBarHeight: isDesktopLayout ? 88 : categoryBarHeight,
      });
      const anchorOffsetFromTop = anchorPosition - root.scrollTop;
      const sectionTop = getSectionOffsetTop(section, root);

      root.scrollTo({
        top: Math.max(0, sectionTop - anchorOffsetFromTop),
        behavior: 'smooth',
      });
    },
    [heroCollapsed, isDesktopLayout, lockDesktopScrollSpy, lockMobileScrollSpy],
  );

  const handleDesktopCategorySelect = useCallback(
    (categoryId: string) => {
      if (selectedProductId || selectedPromotionId || showCart) {
        if (selectedProductId) {
          setSelectedProductId(null);
          setProductHeroCollapsed(false);
        }
        if (selectedPromotionId) {
          setSelectedPromotionId(null);
        }
        if (showCart) {
          setShowCart(false);
        }
        pendingDesktopCategoryScrollRef.current = categoryId;
        setActiveCategoryId(categoryId);
        lockDesktopScrollSpy();
        return;
      }
      scrollToCategory(categoryId);
    },
    [selectedProductId, selectedPromotionId, showCart, scrollToCategory, lockDesktopScrollSpy],
  );

  useEffect(() => {
    const categoryId = pendingDesktopCategoryScrollRef.current;
    if (!isDesktopLayout || categoryId == null || selectedProductId || selectedPromotionId || showCart) {
      return;
    }

    pendingDesktopCategoryScrollRef.current = null;
    scrollToCategory(categoryId);
  }, [isDesktopLayout, selectedProductId, selectedPromotionId, showCart, scrollToCategory, categories]);

  const handleMobileScroll = useCallback(() => {
    if (mobileScrollRafRef.current != null) return;
    mobileScrollRafRef.current = requestAnimationFrame(() => {
      mobileScrollRafRef.current = null;
      const el = mobileScrollRef.current;
      if (!el) return;
      setScrollY(el.scrollTop);
    });
  }, []);

  useEffect(() => {
    setHeroCollapsed(false);
    setScrollY(0);
    if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = 0;
    if (desktopScrollRef.current) desktopScrollRef.current.scrollTop = 0;
  }, [restaurant?.subdomain]);

  useEffect(() => {
    const root = mobileScrollRef.current;
    const sentinel = heroSentinelRef.current;
    if (!root || !sentinel || selectedProductId || selectedPromotionId || showCart) return;

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
  }, [restaurant?.subdomain, loading, selectedProductId, selectedPromotionId, showCart]);

  useEffect(() => {
    if (isDesktopLayout || !activeCategoryId) return;

    const bar = categoryBarRef.current;
    if (!bar) return;

    const activeTab = bar.querySelector<HTMLElement>(
      `[data-category-tab="${activeCategoryId}"]`,
    );
    if (!activeTab) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollCategoryTabIntoView(bar, activeTab, prefersReducedMotion ? 'auto' : 'smooth');
  }, [activeCategoryId, isDesktopLayout]);

  const logoUrl = useMemo(() => storagePublicUrl(restaurant?.logo_path ?? null), [restaurant?.logo_path]);
  const coverUrl = useMemo(() => storagePublicUrl(restaurant?.cover_path ?? null), [restaurant?.cover_path]);
  const showFloatControls = !heroCollapsed && scrollY < COVER_HEIGHT * 0.55;

  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [products, selectedProductId],
  );

  const selectedPromotion = useMemo(
    () =>
      selectedPromotionId
        ? promotionsContext?.items.find((promotion) => promotion.id === selectedPromotionId) ?? null
        : null,
    [promotionsContext?.items, selectedPromotionId],
  );

  const promotionBannerViewport = isDesktopLayout ? 'desktop' : isTabletLayout ? 'tablet' : 'mobile';

  const bundleComplementRules = useMemo(() => {
    if (!selectedProduct) return null;
    return getBundleComplementRulesForProduct(
      selectedProduct,
      promotionsContext?.items ?? [],
      effectiveNow,
      promotionTimezone,
    );
  }, [selectedProduct, promotionsContext, effectiveNow, promotionTimezone]);

  const openProduct = useCallback(
    (productId: string) => {
      triggerHaptic('selection');

      if (isDesktopLayout) {
        const product = products.find((item) => item.id === productId);
        if (product) {
          const productCategoryId =
            categoryIds.find((categoryId) => product.category_ids.includes(categoryId)) ??
            product.category_ids[0] ??
            null;
          if (productCategoryId) {
            setActiveCategoryId(productCategoryId);
          }
        }
      }

      setShowCart(false);
      setSelectedPromotionId(null);
      setSelectedProductId(productId);
      setProductHeroCollapsed(false);
      mobileScrollRef.current?.scrollTo({ top: 0 });
      desktopScrollRef.current?.scrollTo({ top: 0 });
    },
    [categoryIds, isDesktopLayout, products],
  );

  const closeProduct = useCallback(() => {
    setSelectedProductId(null);
    setProductHeroCollapsed(false);
  }, []);

  const openPromotion = useCallback((promotionId: string) => {
    triggerHaptic('selection');
    setShowCart(false);
    setSelectedProductId(null);
    setProductHeroCollapsed(false);
    setPromotionHeroCollapsed(false);
    setSelectedPromotionId(promotionId);
    mobileScrollRef.current?.scrollTo({ top: 0 });
    desktopScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const closePromotion = useCallback(() => {
    setSelectedPromotionId(null);
    setPromotionHeroCollapsed(false);
  }, []);

  const openCart = useCallback(() => {
    setSelectedProductId(null);
    setSelectedPromotionId(null);
    setProductHeroCollapsed(false);
    setShowCart(true);
    mobileScrollRef.current?.scrollTo({ top: 0 });
    desktopScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const closeCart = useCallback(() => {
    setShowCart(false);
  }, []);

  const openSearch = useCallback(() => {
    setShowSearch(true);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
  }, []);

  useEffect(() => {
    if (loading || loadError) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowSearch((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, loadError]);

  const handleAddToCart = useCallback(
    (payload: { quantity: number; selections: OptionSelections; lineTotal: number; notes: string }) => {
      if (!selectedProduct) return;
      cart.addItem(
        buildAddToCartInput(
          selectedProduct,
          productDiscounts.get(selectedProduct.id),
          payload.quantity,
          payload.selections,
          payload.notes,
        ),
      );
    },
    [cart, productDiscounts, selectedProduct],
  );

  const cartCurrency = cart.lines[0]?.currency ?? products[0]?.currency ?? 'MXN';
  const showCartBar =
    !showCart && cart.itemCount > 0 && !selectedProduct;
  const detailHeroCollapsed = selectedProduct
    ? productHeroCollapsed
    : selectedPromotion
      ? promotionHeroCollapsed
      : false;
  const detailTitle = selectedProduct?.name ?? selectedPromotion?.name ?? '';
  const closeDetailView = selectedProduct ? closeProduct : closePromotion;
  const showDetailChrome = Boolean(selectedProduct || selectedPromotion) && !showCart;

  if (loading) {
    return (
      <div className={styles.publicShell}>
        <p className={styles.stateText}>Cargando menú…</p>
      </div>
    );
  }

  if (loadError || !restaurant) {
    return (
      <div className={styles.publicShell}>
        <p className={styles.stateError}>{loadError ?? 'Menú no disponible.'}</p>
      </div>
    );
  }

  return (
    <div
      className={styles.publicShell}
      style={menuThemeStyle}
      data-layout={isDesktopLayout ? 'desktop' : 'mobile'}
      data-viewport={viewportBand}
    >
      {!isDesktopLayout ? (
        <div className={styles.mobileLayout}>
        <div
          className={`${menuStyles.phone} ${menuStyles.publicRoot} ${styles.mobileFrame} ${
            isTabletLayout ? menuStyles.publicTablet : ''
          }`}
          data-cat-tabs={menuTheme.style.categoryTabStyle}
        >
          {showDetailChrome ? (
            <>
              {!detailHeroCollapsed ? (
                <button
                  type="button"
                  className={styles.productFixedBack}
                  aria-label="Volver al menú"
                  onClick={closeDetailView}
                >
                  <ArrowBackIcon fontSize="small" />
                </button>
              ) : null}
              {!detailHeroCollapsed ? (
                <CartHeaderButton
                  itemCount={cart.itemCount}
                  onClick={openCart}
                  variant="float"
                />
              ) : null}
              <header
                className={`${menuStyles.compactHeader} ${
                  detailHeroCollapsed ? menuStyles.compactHeaderVisible : ''
                }`}
                aria-hidden={!detailHeroCollapsed}
              >
                {detailHeroCollapsed ? (
                  <button
                    type="button"
                    className={menuStyles.compactIconBtn}
                    aria-label="Volver al menú"
                    onClick={closeDetailView}
                  >
                    <ArrowBackIcon fontSize="small" />
                  </button>
                ) : null}
                <span className={menuStyles.compactTitle}>{detailTitle}</span>
                <div className={menuStyles.headerActions}>
                  <CartHeaderButton
                    itemCount={cart.itemCount}
                    onClick={openCart}
                    variant="compact"
                  />
                </div>
              </header>
            </>
          ) : showCart ? null : (
            <header
              className={`${menuStyles.compactHeader} ${heroCollapsed ? menuStyles.compactHeaderVisible : ''}`}
              aria-hidden={!heroCollapsed}
            >
              <span className={menuStyles.compactTitle}>{restaurant.name}</span>
              <div className={menuStyles.headerActions}>
                <button
                  type="button"
                  className={`${menuStyles.compactIconBtn} ${styles.cartHeaderBtn}`}
                  aria-label={
                    cart.itemCount > 0
                      ? `Ver carrito, ${cart.itemCount} artículos`
                      : 'Ver carrito'
                  }
                  onClick={openCart}
                >
                  <ShoppingBagOutlinedIcon fontSize="small" />
                  {cart.itemCount > 0 ? (
                    <span className={styles.cartHeaderBadge} aria-hidden>
                      {cart.itemCount}
                    </span>
                  ) : null}
                </button>
                <span className={menuStyles.compactIconBtn} aria-label="Compartir">
                  <IosShareOutlinedIcon fontSize="small" />
                </span>
                <button
                  type="button"
                  className={menuStyles.compactIconBtn}
                  aria-label="Buscar en el menú"
                  onClick={openSearch}
                >
                  <SearchOutlinedIcon fontSize="small" />
                </button>
              </div>
            </header>
          )}

          <div
            ref={mobileScrollRef}
            className={`${menuStyles.phoneScroll} ${styles.mobileScroll} ${
              selectedProduct || selectedPromotion || showCart ? menuStyles.phoneScrollDetail : ''
            } ${showCart ? styles.mobileScrollCart : ''}`}
            onScroll={selectedProduct || selectedPromotion || showCart ? undefined : handleMobileScroll}
          >
            {showCart ? (
              <PublicMenuCart
                subdomain={subdomain}
                lines={cart.lines}
                validProductIds={validProductIds}
                products={products}
                promotions={promotionsContext?.items ?? []}
                productDiscounts={productDiscounts}
                currency={cartCurrency}
                onBack={closeCart}
                onUpdateQuantity={cart.updateLineQuantity}
                onRemoveLine={cart.removeLine}
                isTabletLayout={isTabletLayout}
              />
            ) : selectedPromotion ? (
              <PromotionShortcutProductsView
                key={selectedPromotion.id}
                promotion={selectedPromotion}
                products={products}
                productDiscounts={productDiscounts}
                productTimeLimitedPromotions={productTimeLimitedPromotions}
                timezone={promotionTimezone}
                countdownContext={promotionCountdownContext}
                heroCollapsed={promotionHeroCollapsed}
                onHeroCollapsedChange={setPromotionHeroCollapsed}
                scrollRootRef={mobileScrollRef}
                onProductClick={openProduct}
                onBack={closePromotion}
                hideHeroBackButton
                isTabletLayout={isTabletLayout}
              />
            ) : selectedProduct ? (
              <DigitalMenuProductDetail
                key={selectedProduct.id}
                product={selectedProduct}
                discount={productDiscounts.get(selectedProduct.id)}
                timeLimitedPromotion={productTimeLimitedPromotions.get(selectedProduct.id) ?? null}
                promotionTimezone={promotionTimezone}
                countdownContext={promotionCountdownContext}
                bundleComplementRules={bundleComplementRules}
                heroCollapsed={productHeroCollapsed}
                onHeroCollapsedChange={setProductHeroCollapsed}
                scrollRootRef={mobileScrollRef}
                onBack={closeProduct}
                onAddToCart={handleAddToCart}
                hideHeroBackButton
                enableHaptics
                isTabletLayout={isTabletLayout}
              />
            ) : (
              <>
                <section className={menuStyles.menuHero} aria-label="Información del restaurante">
                  <div className={menuStyles.coverWrap}>
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className={menuStyles.coverImage} />
                    ) : (
                      <div className={menuStyles.coverPlaceholder} aria-hidden />
                    )}
                    <div className={menuStyles.coverScrim} aria-hidden />
                    <div
                      className={menuStyles.coverFloatBar}
                      data-visible={showFloatControls ? 'true' : 'false'}
                      aria-hidden={!showFloatControls}
                    >
                      <div className={menuStyles.headerActions}>
                        <button
                          type="button"
                          className={`${menuStyles.floatIconBtn} ${styles.cartHeaderBtn}`}
                          aria-label={
                            cart.itemCount > 0
                              ? `Ver carrito, ${cart.itemCount} artículos`
                              : 'Ver carrito'
                          }
                          onClick={openCart}
                        >
                          <ShoppingBagOutlinedIcon fontSize="small" />
                          {cart.itemCount > 0 ? (
                            <span className={styles.cartHeaderBadge} aria-hidden>
                              {cart.itemCount}
                            </span>
                          ) : null}
                        </button>
                        <span className={menuStyles.floatIconBtn} aria-label="Compartir">
                          <IosShareOutlinedIcon fontSize="small" />
                        </span>
                        <button
                          type="button"
                          className={menuStyles.floatIconBtn}
                          aria-label="Buscar en el menú"
                          onClick={openSearch}
                        >
                          <SearchOutlinedIcon fontSize="small" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={menuStyles.restaurantHeader}>
                    <div className={menuStyles.logoRow}>
                      <div className={menuStyles.logoWrap}>
                        {logoUrl ? (
                          <img src={logoUrl} alt="" className={menuStyles.logoImage} />
                        ) : (
                          <div className={menuStyles.logoPlaceholder}>
                            {(restaurant.name.trim()[0] ?? '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className={menuStyles.nameBlock}>
                        <h1 className={menuStyles.restaurantNameStatic}>{restaurant.name}</h1>
                        <RestaurantOpenStatusBadge schedules={schedules} services={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES} />
                      </div>
                    </div>
                    {restaurant.description ? (
                      <p className={menuStyles.restaurantDescriptionStatic}>{restaurant.description}</p>
                    ) : null}
                    <RestaurantServiceChips services={enabledServices} />
                    <div ref={heroSentinelRef} className={menuStyles.heroSentinel} aria-hidden />
                  </div>
                </section>

                {categories.length === 0 ? (
                  <div className={menuStyles.emptyCategories}>Este menú aún no tiene categorías.</div>
                ) : (
                  <>
                    <div
                      ref={categoryBarRef}
                      className={`${menuStyles.categoryBar} ${
                        heroCollapsed ? menuStyles.categoryBarPinned : ''
                      }`}
                    >
                      {displayCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          data-category-tab={cat.id}
                          className={`${menuStyles.categoryTab} ${
                            activeCategoryId === cat.id ? menuStyles.categoryTabActive : ''
                          }`}
                          onClick={() => scrollToCategory(cat.id)}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>

                    <DigitalMenuCategorySections
                      displayCategories={displayCategories}
                      products={products}
                      productDiscounts={productDiscounts}
                      productTimeLimitedPromotions={productTimeLimitedPromotions}
                      promotionShortcuts={promotionShortcuts}
                      promotionTimezone={promotionTimezone}
                      countdownContext={promotionCountdownContext}
                      sectionRefs={sectionRefs}
                      isTabletLayout={isTabletLayout}
                      promotionBannerViewport={promotionBannerViewport}
                      onProductClick={openProduct}
                      onPromotionSelect={openPromotion}
                    />
                  </>
                )}

                <RestaurantHoursDisplay
                  schedules={schedules}
                  serviceTypes={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES}
                  flat
                  className={isTabletLayout ? menuStyles.tabletInsetSection : undefined}
                />
                <RestaurantLocationSection
                  restaurant={restaurant}
                  cartBarInset={showCartBar}
                  className={isTabletLayout ? menuStyles.tabletInsetSection : undefined}
                />
              </>
            )}
          </div>
        </div>
      </div>
      ) : (
      <div className={styles.desktopLayout}>
        {showDetailChrome ? (
          <>
            {!detailHeroCollapsed ? (
              <button
                type="button"
                className={styles.productFixedBack}
                aria-label="Volver al menú"
                onClick={closeDetailView}
              >
                <ArrowBackIcon fontSize="small" />
              </button>
            ) : null}
            <header
              className={`${menuStyles.compactHeader} ${styles.productDesktopCompactHeader} ${
                detailHeroCollapsed ? menuStyles.compactHeaderVisible : ''
              }`}
              aria-hidden={!detailHeroCollapsed}
            >
              {detailHeroCollapsed ? (
                <button
                  type="button"
                  className={menuStyles.compactIconBtn}
                  aria-label="Volver al menú"
                  onClick={closeDetailView}
                >
                  <ArrowBackIcon fontSize="small" />
                </button>
              ) : null}
              <span className={menuStyles.compactTitle}>{detailTitle}</span>
            </header>
          </>
        ) : null}
        <PublicDesktopMenuLayout
          restaurant={restaurant}
          displayCategories={displayCategories}
          products={products}
          schedules={schedules}
          enabledServices={enabledServices}
          productDiscounts={productDiscounts}
          productTimeLimitedPromotions={productTimeLimitedPromotions}
          promotionShortcuts={promotionShortcuts}
          promotionTimezone={promotionTimezone}
          countdownContext={promotionCountdownContext}
          logoUrl={logoUrl}
          coverUrl={coverUrl}
          activeCategoryId={activeCategoryId}
          onCategorySelect={handleDesktopCategorySelect}
          onPromotionSelect={openPromotion}
          sectionRefs={sectionRefs}
          scrollRef={desktopScrollRef}
          onProductClick={openProduct}
          cartItemCount={cart.itemCount}
          onOpenCart={openCart}
          onOpenSearch={openSearch}
          themeStyle={menuThemeStyle}
        >
          {showCart ? (
            <PublicMenuCart
              subdomain={subdomain}
              lines={cart.lines}
              validProductIds={validProductIds}
              products={products}
              promotions={promotionsContext?.items ?? []}
              productDiscounts={productDiscounts}
              currency={cartCurrency}
              onBack={closeCart}
              onUpdateQuantity={cart.updateLineQuantity}
              onRemoveLine={cart.removeLine}
            />
          ) : selectedPromotion ? (
            <PromotionShortcutProductsView
              key={selectedPromotion.id}
              promotion={selectedPromotion}
              products={products}
              productDiscounts={productDiscounts}
              productTimeLimitedPromotions={productTimeLimitedPromotions}
              timezone={promotionTimezone}
              countdownContext={promotionCountdownContext}
              heroCollapsed={promotionHeroCollapsed}
              onHeroCollapsedChange={setPromotionHeroCollapsed}
              scrollRootRef={desktopScrollRef}
              onProductClick={openProduct}
              onBack={closePromotion}
              hideHeroBackButton
            />
          ) : selectedProduct ? (
            <DigitalMenuProductDetail
              key={selectedProduct.id}
              product={selectedProduct}
              discount={productDiscounts.get(selectedProduct.id)}
              timeLimitedPromotion={productTimeLimitedPromotions.get(selectedProduct.id) ?? null}
              promotionTimezone={promotionTimezone}
              countdownContext={promotionCountdownContext}
              bundleComplementRules={bundleComplementRules}
              heroCollapsed={productHeroCollapsed}
              onHeroCollapsedChange={setProductHeroCollapsed}
              scrollRootRef={desktopScrollRef}
              onBack={closeProduct}
              onAddToCart={handleAddToCart}
              hideHeroBackButton
              enableHaptics
            />
          ) : undefined}
        </PublicDesktopMenuLayout>
      </div>
      )}

      {showCartBar ? (
        <PublicMenuCartBar
          itemCount={cart.itemCount}
          subtotalCents={cartSubtotalCents}
          currency={cartCurrency}
          isEstimated
          onOpenCart={openCart}
          isTabletLayout={isTabletLayout}
        />
      ) : null}

      <PublicMenuSearch
        open={showSearch}
        onClose={closeSearch}
        products={products}
        categories={displayCategories}
        promotions={promotionsContext?.items ?? []}
        productDiscounts={productDiscounts}
        productTimeLimitedPromotions={productTimeLimitedPromotions}
        promotionTimezone={promotionTimezone}
        countdownContext={promotionCountdownContext}
        onProductSelect={openProduct}
        onPromotionSelect={openPromotion}
        onCategorySelect={isDesktopLayout ? handleDesktopCategorySelect : scrollToCategory}
        themeStyle={menuThemeStyle}
      />
    </div>
  );
}
