'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { DigitalMenuProductDetail } from '@/components/digital-menu/DigitalMenuProductDetail';
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
import {
  buildMenuProductDiscountMap,
} from '@/lib/promotions/menuProductDiscount';
import {
  DEFAULT_DIGITAL_MENU_THEME_ID,
  digitalMenuThemeToStyle,
  getDigitalMenuThemeOrDefault,
  loadDigitalMenuThemeFonts,
} from '@/lib/digital-menu/themes';
import { resolveRestaurantServices } from '@/lib/restaurantServices';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import menuStyles from './DigitalMenuPage.module.css';
import styles from './PublicDigitalMenuPage.module.css';

const COVER_HEIGHT = 168;
const PINNED_BAR_HEIGHT = 48;

type PublicDigitalMenuPageProps = {
  subdomain: string;
};

export default function PublicDigitalMenuPage({ subdomain }: PublicDigitalMenuPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

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

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategoryId(categoryId);
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollY(el.scrollTop);
  }, []);

  useEffect(() => {
    setHeroCollapsed(false);
    setScrollY(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [restaurant?.subdomain]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = heroSentinelRef.current;
    if (!root || !sentinel || selectedProductId) return;

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
  }, [restaurant?.subdomain, loading, selectedProductId]);

  const logoUrl = useMemo(() => storagePublicUrl(restaurant?.logo_path ?? null), [restaurant?.logo_path]);
  const coverUrl = useMemo(() => storagePublicUrl(restaurant?.cover_path ?? null), [restaurant?.cover_path]);
  const showFloatControls = !heroCollapsed && scrollY < COVER_HEIGHT * 0.55;

  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [products, selectedProductId],
  );

  const openProduct = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setProductHeroCollapsed(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const closeProduct = useCallback(() => {
    setSelectedProductId(null);
    setProductHeroCollapsed(false);
  }, []);

  if (loading) {
    return (
      <div className={styles.statePage}>
        <p className={styles.stateText}>Cargando menú…</p>
      </div>
    );
  }

  if (loadError || !restaurant) {
    return (
      <div className={styles.statePage}>
        <p className={styles.stateError}>{loadError ?? 'Menú no disponible.'}</p>
      </div>
    );
  }

  return (
    <div
      className={`${menuStyles.phone} ${menuStyles.publicRoot} ${styles.viewport}`}
      style={menuThemeStyle}
      data-cat-tabs={menuTheme.style.categoryTabStyle}
    >
      {selectedProduct ? (
        <header
          className={`${menuStyles.compactHeader} ${
            productHeroCollapsed ? menuStyles.compactHeaderVisible : ''
          }`}
          aria-hidden={!productHeroCollapsed}
        >
          <button
            type="button"
            className={menuStyles.compactIconBtn}
            aria-label="Volver al menú"
            onClick={closeProduct}
          >
            <ArrowBackIcon fontSize="small" />
          </button>
          <span className={menuStyles.compactTitle}>{selectedProduct.name}</span>
        </header>
      ) : (
        <header
          className={`${menuStyles.compactHeader} ${heroCollapsed ? menuStyles.compactHeaderVisible : ''}`}
          aria-hidden={!heroCollapsed}
        >
          <span className={menuStyles.compactTitle}>{restaurant.name}</span>
          <div className={menuStyles.headerActions}>
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
        ref={scrollRef}
        className={`${menuStyles.phoneScroll} ${styles.publicScroll} ${
          selectedProduct ? menuStyles.phoneScrollDetail : ''
        }`}
        onScroll={selectedProduct ? undefined : handleScroll}
      >
        {selectedProduct ? (
          <DigitalMenuProductDetail
            product={selectedProduct}
            discount={productDiscounts.get(selectedProduct.id)}
            heroCollapsed={productHeroCollapsed}
            onHeroCollapsedChange={setProductHeroCollapsed}
            scrollRootRef={scrollRef}
            onBack={closeProduct}
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
                  className={`${menuStyles.categoryBar} ${
                    heroCollapsed ? menuStyles.categoryBarPinned : ''
                  }`}
                >
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
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
                      ref={(el) => {
                        sectionRefs.current[cat.id] = el;
                      }}
                      className={menuStyles.section}
                    >
                      <div className={menuStyles.sectionHeader}>
                        <h2 className={menuStyles.sectionTitle}>{cat.name}</h2>
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

            <RestaurantHoursDisplay schedules={schedules} serviceTypes={enabledServices} />
            <RestaurantLocationSection restaurant={restaurant} />
          </>
        )}
      </div>
    </div>
  );
}
