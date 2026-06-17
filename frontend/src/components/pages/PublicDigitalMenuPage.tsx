'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { DigitalMenuProductDetail } from '@/components/digital-menu/DigitalMenuProductDetail';
import { PublicDesktopMenuLayout } from '@/components/digital-menu/PublicDesktopMenuLayout';
import { PublicMenuCart } from '@/components/digital-menu/PublicMenuCart';
import { PublicMenuCartBar } from '@/components/digital-menu/PublicMenuCartBar';
import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';
import {
  ProductList,
  productsForCategory,
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
  type PublicRestaurant,
} from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import { buildMenuProductDiscountMap } from '@/lib/promotions/menuProductDiscount';
import {
  DEFAULT_DIGITAL_MENU_THEME_ID,
  digitalMenuThemeToStyle,
  getDigitalMenuThemeOrDefault,
  loadDigitalMenuThemeFonts,
} from '@/lib/digital-menu/themes';
import { resolveRestaurantServices } from '@/lib/restaurantServices';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { buildAddToCartInput } from '@/lib/digital-menu/cart/buildCartLine';
import { scrollCategoryTabIntoView, getCategoryScrollAnchorPosition, getSectionOffsetTop } from '@/lib/digital-menu/categoryScrollSpy';
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
  const [promotions, setPromotions] = useState<Awaited<ReturnType<typeof getPublicRestaurantPromotions>>>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productHeroCollapsed, setProductHeroCollapsed] = useState(false);
  const [showCart, setShowCart] = useState(false);

  const cart = usePublicMenuCart(subdomain);

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
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const [restaurantData, menuData, scheduleRows, promotionRows] = await Promise.all([
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
        setPromotions(promotionRows);
        setActiveCategoryId(sortedCategories[0]?.id ?? null);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError && error.httpStatus === 404
              ? 'No encontramos un menú público con ese subdominio.'
              : 'No se pudo cargar el menú. Inténtalo de nuevo.',
          );
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

  const productDiscounts = useMemo(
    () => buildMenuProductDiscountMap(products, promotions),
    [products, promotions],
  );

  const categoryIds = useMemo(() => categories.map((cat) => cat.id), [categories]);

  const mobileScrollSpyEnabled =
    !isDesktopLayout && !selectedProductId && !showCart && categoryIds.length > 0 && !loading;

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
    isDesktopLayout && !selectedProductId && !showCart && categoryIds.length > 0 && !loading;

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
      if (selectedProductId || showCart) {
        if (selectedProductId) {
          setSelectedProductId(null);
          setProductHeroCollapsed(false);
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
    [selectedProductId, showCart, scrollToCategory, lockDesktopScrollSpy],
  );

  useEffect(() => {
    const categoryId = pendingDesktopCategoryScrollRef.current;
    if (!isDesktopLayout || categoryId == null || selectedProductId || showCart) {
      return;
    }

    pendingDesktopCategoryScrollRef.current = null;
    scrollToCategory(categoryId);
  }, [isDesktopLayout, selectedProductId, showCart, scrollToCategory, categories]);

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
    if (!root || !sentinel || selectedProductId || showCart) return;

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
  }, [restaurant?.subdomain, loading, selectedProductId, showCart]);

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

  const openProduct = useCallback(
    (productId: string) => {
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

  const openCart = useCallback(() => {
    setSelectedProductId(null);
    setProductHeroCollapsed(false);
    setShowCart(true);
    mobileScrollRef.current?.scrollTo({ top: 0 });
    desktopScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const closeCart = useCallback(() => {
    setShowCart(false);
  }, []);

  const handleAddToCart = useCallback(
    (payload: { quantity: number; selections: OptionSelections; lineTotal: number }) => {
      if (!selectedProduct) return;
      cart.addItem(
        buildAddToCartInput(
          selectedProduct,
          productDiscounts.get(selectedProduct.id),
          payload.quantity,
          payload.selections,
        ),
      );
    },
    [cart, productDiscounts, selectedProduct],
  );

  const cartCurrency = cart.lines[0]?.currency ?? products[0]?.currency ?? 'MXN';
  const showCartBar = !showCart && cart.itemCount > 0 && !selectedProduct;

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
          {selectedProduct ? (
            <>
              {!productHeroCollapsed ? (
                <button
                  type="button"
                  className={styles.productFixedBack}
                  aria-label="Volver al menú"
                  onClick={closeProduct}
                >
                  <ArrowBackIcon fontSize="small" />
                </button>
              ) : null}
              {!productHeroCollapsed ? (
                <CartHeaderButton
                  itemCount={cart.itemCount}
                  onClick={openCart}
                  variant="float"
                />
              ) : null}
              <header
                className={`${menuStyles.compactHeader} ${styles.productCompactHeader} ${
                  productHeroCollapsed ? menuStyles.compactHeaderVisible : ''
                }`}
                aria-hidden={!productHeroCollapsed}
              >
                <span className={menuStyles.compactTitle}>{selectedProduct.name}</span>
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
                <span className={menuStyles.compactIconBtn} aria-label="Buscar">
                  <SearchOutlinedIcon fontSize="small" />
                </span>
              </div>
            </header>
          )}

          <div
            ref={mobileScrollRef}
            className={`${menuStyles.phoneScroll} ${styles.mobileScroll} ${
              selectedProduct || showCart ? menuStyles.phoneScrollDetail : ''
            } ${showCart ? styles.mobileScrollCart : ''}`}
            onScroll={selectedProduct || showCart ? undefined : handleMobileScroll}
          >
            {showCart ? (
              <PublicMenuCart
                lines={cart.lines}
                subtotalCents={cart.subtotalCents}
                currency={cartCurrency}
                onBack={closeCart}
                onUpdateQuantity={cart.updateLineQuantity}
                onRemoveLine={cart.removeLine}
                isTabletLayout={isTabletLayout}
              />
            ) : selectedProduct ? (
              <DigitalMenuProductDetail
                key={selectedProduct.id}
                product={selectedProduct}
                discount={productDiscounts.get(selectedProduct.id)}
                heroCollapsed={productHeroCollapsed}
                onHeroCollapsedChange={setProductHeroCollapsed}
                scrollRootRef={mobileScrollRef}
                onBack={closeProduct}
                onAddToCart={handleAddToCart}
                hideHeroBackButton
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
                        <span className={menuStyles.floatIconBtn} aria-label="Buscar">
                          <SearchOutlinedIcon fontSize="small" />
                        </span>
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
                        <RestaurantOpenStatusBadge schedules={schedules} services={enabledServices} />
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
                      {categories.map((cat) => (
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

                    {categories.map((cat) => {
                      const layout = cat.display_layout ?? 'vertical';
                      const catProducts = productsForCategory(products, cat.id);
                      return (
                        <section
                          key={cat.id}
                          id={`menu-section-${cat.id}`}
                          data-category-id={cat.id}
                          ref={(el) => {
                            sectionRefs.current[cat.id] = el;
                          }}
                          className={menuStyles.section}
                        >
                          <div className={menuStyles.sectionHeader}>
                            <h2 className={menuStyles.sectionTitle}>{cat.name}</h2>
                          </div>
                          <ProductList
                            layout={isTabletLayout ? 'tablet' : layout}
                            products={catProducts}
                            productDiscounts={productDiscounts}
                            onProductClick={openProduct}
                          />
                        </section>
                      );
                    })}
                  </>
                )}

                <RestaurantHoursDisplay
                  schedules={schedules}
                  serviceTypes={enabledServices}
                  className={isTabletLayout ? menuStyles.tabletInsetSection : undefined}
                />
                <RestaurantLocationSection
                  restaurant={restaurant}
                  className={isTabletLayout ? menuStyles.tabletInsetSection : undefined}
                />
              </>
            )}
          </div>
        </div>
      </div>
      ) : (
      <div className={styles.desktopLayout}>
        {selectedProduct && !showCart ? (
          <>
            <button
              type="button"
              className={styles.productFixedBack}
              aria-label="Volver al menú"
              onClick={closeProduct}
            >
              <ArrowBackIcon fontSize="small" />
            </button>
            <header
              className={`${menuStyles.compactHeader} ${styles.productCompactHeader} ${styles.productDesktopCompactHeader} ${
                productHeroCollapsed ? menuStyles.compactHeaderVisible : ''
              }`}
              aria-hidden={!productHeroCollapsed}
            >
              <span className={menuStyles.compactTitle}>{selectedProduct.name}</span>
            </header>
          </>
        ) : null}
        <PublicDesktopMenuLayout
          restaurant={restaurant}
          categories={categories}
          products={products}
          schedules={schedules}
          enabledServices={enabledServices}
          productDiscounts={productDiscounts}
          logoUrl={logoUrl}
          coverUrl={coverUrl}
          activeCategoryId={activeCategoryId}
          onCategorySelect={handleDesktopCategorySelect}
          sectionRefs={sectionRefs}
          scrollRef={desktopScrollRef}
          onProductClick={openProduct}
          cartItemCount={cart.itemCount}
          onOpenCart={openCart}
        >
          {showCart ? (
            <PublicMenuCart
              lines={cart.lines}
              subtotalCents={cart.subtotalCents}
              currency={cartCurrency}
              onBack={closeCart}
              onUpdateQuantity={cart.updateLineQuantity}
              onRemoveLine={cart.removeLine}
            />
          ) : selectedProduct ? (
            <DigitalMenuProductDetail
              key={selectedProduct.id}
              product={selectedProduct}
              discount={productDiscounts.get(selectedProduct.id)}
              heroCollapsed={productHeroCollapsed}
              onHeroCollapsedChange={setProductHeroCollapsed}
              scrollRootRef={desktopScrollRef}
              onBack={closeProduct}
              onAddToCart={handleAddToCart}
              hideHeroBackButton
            />
          ) : undefined}
        </PublicDesktopMenuLayout>
      </div>
      )}

      {showCartBar ? (
        <PublicMenuCartBar
          itemCount={cart.itemCount}
          subtotalCents={cart.subtotalCents}
          currency={cartCurrency}
          onOpenCart={openCart}
          isTabletLayout={isTabletLayout}
        />
      ) : null}
    </div>
  );
}
