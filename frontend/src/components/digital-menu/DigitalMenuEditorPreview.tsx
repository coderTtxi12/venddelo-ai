'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import TabletMacOutlinedIcon from '@mui/icons-material/TabletMacOutlined';
import type { CSSProperties, MutableRefObject } from 'react';
import type {
  Category,
  CategoryDisplayLayout,
  OptionGroup,
  Product,
  Promotion,
  Restaurant,
  RestaurantSchedule,
} from '@/lib/api/types';
import { DigitalMenuProductDetail } from '@/components/digital-menu/DigitalMenuProductDetail';
import { DigitalMenuEditorCategoryBar } from '@/components/digital-menu/DigitalMenuEditorCategoryBar';
import { DigitalMenuEditorCategorySections } from '@/components/digital-menu/DigitalMenuEditorCategorySections';
import { DigitalMenuEditorDesktopLayout } from '@/components/digital-menu/DigitalMenuEditorDesktopLayout';
import { DigitalMenuEditorHero } from '@/components/digital-menu/DigitalMenuEditorHero';
import { RestaurantLocationSection } from '@/components/digital-menu/RestaurantLocationSection';
import { RestaurantHoursDisplay } from '@/components/digital-menu/RestaurantHoursDisplay';
import type { ProductDragTarget } from '@/components/digital-menu/SortableProductList';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { PUBLIC_MENU_SCHEDULE_SERVICE_TYPES, type RestaurantServiceType } from '@/lib/restaurantServices';
import {
  getCategoryScrollAnchorPosition,
  getSectionOffsetTop,
  scrollCategoryTabIntoView,
} from '@/lib/digital-menu/categoryScrollSpy';
import { useCategoryScrollSpy } from '@/lib/digital-menu/useCategoryScrollSpy';
import {
  canShowEditorPreviewDevice,
  DIGITAL_MENU_COVER_HEIGHT_PX,
  DIGITAL_MENU_PINNED_BAR_HEIGHT_PX,
  EDITOR_PREVIEW_DESKTOP_FRAME_MIN_WIDTH,
  EDITOR_PREVIEW_TABLET_FRAME_WIDTH,
} from '@/lib/digital-menu/layout';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import publicMenuStyles from '@/components/pages/PublicDigitalMenuPage.module.css';
import styles from './DigitalMenuEditorPreview.module.css';

export type DigitalMenuEditorDevice = 'mobile' | 'tablet' | 'desktop';

type DigitalMenuEditorPreviewProps = {
  restaurant: Restaurant;
  displayCategories: Category[];
  products: Product[];
  schedules: RestaurantSchedule[];
  enabledServices: RestaurantServiceType[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  productTimeLimitedPromotions: Map<string, Promotion>;
  promotionShortcuts: Promotion[];
  promotionTimezone: string;
  countdownContext: PromotionCountdownContext;
  logoUrl: string | null;
  coverUrl: string | null;
  menuUrl: string;
  menuThemeStyle: CSSProperties;
  categoryTabStyle: string;
  activeCategoryId: string | null;
  dragCategoryId: string | null;
  dropCategoryId: string | null;
  productDragTarget: ProductDragTarget;
  productDropTarget: ProductDragTarget;
  selectedProductId: string | null;
  productHeroCollapsed: boolean;
  sectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  onActiveCategoryChange: (categoryId: string) => void;
  onDragCategoryIdChange: (categoryId: string | null) => void;
  onDropCategoryIdChange: (categoryId: string | null) => void;
  onCategoryDrop: (targetId: string) => void;
  onProductDragTargetChange: (target: ProductDragTarget) => void;
  onProductDropTargetChange: (target: ProductDragTarget) => void;
  onProductDrop: (categoryId: string, targetProductId: string) => void;
  onProductClick: (productId: string) => void;
  onProductClose: () => void;
  onProductHeroCollapsedChange: (collapsed: boolean) => void;
  onLayoutChange: (categoryId: string, layout: CategoryDisplayLayout) => void;
  onNameBlur: (value: string) => void;
  onDescriptionBlur: (value: string) => void;
  onAssetUpload: (folder: 'logo' | 'cover', file: File) => void;
  onReorderOptionGroups: (reordered: OptionGroup[]) => Promise<void>;
  onReorderOptionItems: (groupId: string, reorderedGroup: OptionGroup) => Promise<void>;
};

const COVER_HEIGHT = DIGITAL_MENU_COVER_HEIGHT_PX;
const PINNED_BAR_HEIGHT = DIGITAL_MENU_PINNED_BAR_HEIGHT_PX;

const DEVICE_UNAVAILABLE_MESSAGES: Record<'tablet' | 'desktop', string> = {
  tablet: `La vista tablet necesita al menos ${EDITOR_PREVIEW_TABLET_FRAME_WIDTH} px de ancho en el área de vista previa. Amplía la ventana del navegador o usa pantalla completa.`,
  desktop: `La vista escritorio necesita al menos ${EDITOR_PREVIEW_DESKTOP_FRAME_MIN_WIDTH} px de ancho en el área de vista previa. Amplía la ventana del navegador o usa pantalla completa.`,
};

function DevicePreviewTab({
  device,
  label,
  icon,
  isActive,
  isAvailable,
  onSelect,
  onUnavailableSelect,
}: {
  device: DigitalMenuEditorDevice;
  label: string;
  icon: ReactNode;
  isActive: boolean;
  isAvailable: boolean;
  onSelect: () => void;
  onUnavailableSelect: (device: 'tablet' | 'desktop') => void;
}) {
  const handleClick = () => {
    if (isAvailable) {
      onSelect();
      return;
    }
    if (device === 'tablet' || device === 'desktop') {
      onUnavailableSelect(device);
    }
  };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-disabled={!isAvailable}
      title={!isAvailable && (device === 'tablet' || device === 'desktop') ? DEVICE_UNAVAILABLE_MESSAGES[device] : undefined}
      className={`${styles.deviceTab} ${isActive ? styles.deviceTabActive : ''} ${
        !isAvailable ? styles.deviceTabUnavailable : ''
      }`}
      onClick={handleClick}
    >
      {icon}
      <span className={styles.deviceTabLabel}>{label}</span>
    </button>
  );
}

export function DigitalMenuEditorPreview({
  restaurant,
  displayCategories,
  products,
  schedules,
  enabledServices,
  productDiscounts,
  productTimeLimitedPromotions,
  promotionShortcuts,
  promotionTimezone,
  countdownContext,
  logoUrl,
  coverUrl,
  menuUrl,
  menuThemeStyle,
  categoryTabStyle,
  activeCategoryId,
  dragCategoryId,
  dropCategoryId,
  productDragTarget,
  productDropTarget,
  selectedProductId,
  productHeroCollapsed,
  sectionRefs,
  onActiveCategoryChange,
  onDragCategoryIdChange,
  onDropCategoryIdChange,
  onCategoryDrop,
  onProductDragTargetChange,
  onProductDropTargetChange,
  onProductDrop,
  onProductClick,
  onProductClose,
  onProductHeroCollapsedChange,
  onLayoutChange,
  onNameBlur,
  onDescriptionBlur,
  onAssetUpload,
  onReorderOptionGroups,
  onReorderOptionItems,
}: DigitalMenuEditorPreviewProps) {
  const [requestedDevice, setRequestedDevice] = useState<DigitalMenuEditorDevice>('mobile');
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [panelWidth, setPanelWidth] = useState(0);
  const [deviceNotice, setDeviceNotice] = useState<'tablet' | 'desktop' | null>(null);

  const previewPanelRef = useRef<HTMLDivElement>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const pendingDesktopCategoryScrollRef = useRef<string | null>(null);

  const categoryIds = useMemo(
    () => displayCategories.map((category) => category.id),
    [displayCategories],
  );

  const canUseTablet = canShowEditorPreviewDevice(panelWidth, 'tablet');
  const canUseDesktop = canShowEditorPreviewDevice(panelWidth, 'desktop');

  const previewDevice = useMemo(() => {
    if (requestedDevice === 'tablet' && !canUseTablet) return 'mobile';
    if (requestedDevice === 'desktop' && !canUseDesktop) {
      return canUseTablet ? 'tablet' : 'mobile';
    }
    return requestedDevice;
  }, [requestedDevice, canUseTablet, canUseDesktop]);

  const isTabletLayout = previewDevice === 'tablet';
  const isDesktopLayout = previewDevice === 'desktop';

  const mobileScrollSpyEnabled =
    !isDesktopLayout && !selectedProductId && categoryIds.length > 0;

  const { lockScrollSpy: lockMobileScrollSpy } = useCategoryScrollSpy({
    enabled: mobileScrollSpyEnabled,
    categoryIds,
    sectionRefs,
    scrollRootRef: mobileScrollRef,
    categoryBarRef,
    heroCollapsed,
    pinnedBarHeight: PINNED_BAR_HEIGHT,
    activeCategoryId,
    onActiveCategoryChange,
  });

  const desktopScrollSpyEnabled =
    isDesktopLayout && !selectedProductId && categoryIds.length > 0;

  const { lockScrollSpy: lockDesktopScrollSpy } = useCategoryScrollSpy({
    enabled: desktopScrollSpyEnabled,
    categoryIds,
    sectionRefs,
    scrollRootRef: desktopScrollRef,
    heroCollapsed: false,
    pinnedBarHeight: 0,
    anchorBarHeight: 88,
    activeCategoryId,
    onActiveCategoryChange,
  });

  const handleDeviceSelect = useCallback((device: DigitalMenuEditorDevice) => {
    setDeviceNotice(null);
    setRequestedDevice(device);
  }, []);

  const handleUnavailableDeviceSelect = useCallback((device: 'tablet' | 'desktop') => {
    setDeviceNotice(device);
  }, []);

  useEffect(() => {
    const panel = previewPanelRef.current;
    if (!panel) return;

    const syncWidth = () => {
      setPanelWidth(panel.getBoundingClientRect().width);
    };

    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const selectedProduct = selectedProductId
    ? products.find((product) => product.id === selectedProductId) ?? null
    : null;

  const showFloatControls = !heroCollapsed && scrollY < COVER_HEIGHT * 0.55;

  const scrollToCategory = useCallback(
    (categoryId: string) => {
      onActiveCategoryChange(categoryId);
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
    [
      heroCollapsed,
      isDesktopLayout,
      lockDesktopScrollSpy,
      lockMobileScrollSpy,
      onActiveCategoryChange,
      sectionRefs,
    ],
  );

  const handleDesktopCategorySelect = useCallback(
    (categoryId: string) => {
      if (selectedProductId) {
        pendingDesktopCategoryScrollRef.current = categoryId;
        onActiveCategoryChange(categoryId);
        onProductClose();
        lockDesktopScrollSpy();
        return;
      }
      scrollToCategory(categoryId);
    },
    [
      selectedProductId,
      scrollToCategory,
      onActiveCategoryChange,
      onProductClose,
      lockDesktopScrollSpy,
    ],
  );

  const handleMobileCategorySelect = useCallback(
    (categoryId: string) => {
      if (selectedProductId) onProductClose();
      scrollToCategory(categoryId);
    },
    [selectedProductId, scrollToCategory, onProductClose],
  );

  const handlePhoneScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
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
  }, [restaurant.id, previewDevice]);

  useEffect(() => {
    const categoryId = pendingDesktopCategoryScrollRef.current;
    if (!isDesktopLayout || categoryId == null || selectedProductId) return;

    pendingDesktopCategoryScrollRef.current = null;
    scrollToCategory(categoryId);
  }, [isDesktopLayout, selectedProductId, scrollToCategory]);

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

  useEffect(() => {
    if (isDesktopLayout) return;

    const root = mobileScrollRef.current;
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
  }, [restaurant.id, isDesktopLayout, selectedProductId]);

  const promotionBannerViewport = isDesktopLayout
    ? 'desktop'
    : isTabletLayout
      ? 'tablet'
      : 'mobile';

  return (
    <div ref={previewPanelRef} className={styles.previewPanel}>
      <div className={styles.deviceToolbar} role="tablist" aria-label="Vista previa por dispositivo">
        <DevicePreviewTab
          device="mobile"
          label="Móvil"
          icon={<PhoneIphoneOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />}
          isActive={previewDevice === 'mobile'}
          isAvailable
          onSelect={() => handleDeviceSelect('mobile')}
          onUnavailableSelect={handleUnavailableDeviceSelect}
        />
        <DevicePreviewTab
          device="tablet"
          label="Tablet"
          icon={<TabletMacOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />}
          isActive={previewDevice === 'tablet'}
          isAvailable={canUseTablet}
          onSelect={() => handleDeviceSelect('tablet')}
          onUnavailableSelect={handleUnavailableDeviceSelect}
        />
        <DevicePreviewTab
          device="desktop"
          label="Escritorio"
          icon={<DesktopWindowsOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />}
          isActive={previewDevice === 'desktop'}
          isAvailable={canUseDesktop}
          onSelect={() => handleDeviceSelect('desktop')}
          onUnavailableSelect={handleUnavailableDeviceSelect}
        />
      </div>

      {deviceNotice ? (
        <div className={styles.deviceNotice} role="status">
          <InfoOutlinedIcon className={styles.deviceNoticeIcon} sx={{ fontSize: 18 }} aria-hidden />
          <p className={styles.deviceNoticeText}>{DEVICE_UNAVAILABLE_MESSAGES[deviceNotice]}</p>
          <button
            type="button"
            className={styles.deviceNoticeDismiss}
            aria-label="Cerrar aviso"
            onClick={() => setDeviceNotice(null)}
          >
            <CloseIcon sx={{ fontSize: 16 }} aria-hidden />
          </button>
        </div>
      ) : null}

      <div
        className={`${styles.previewFrameOuter} ${
          isDesktopLayout ? styles.previewFrameOuterDesktop : ''
        }`}
      >
        <div
          className={`${styles.previewFrameInner} ${
            isDesktopLayout ? styles.previewFrameInnerDesktop : styles.previewFrameInnerDevice
          } ${isTabletLayout ? styles.previewFrameInnerTablet : ''} ${
            previewDevice === 'mobile' ? styles.previewFrameInnerMobile : ''
          }`}
        >
          {isDesktopLayout ? (
            <div className={publicMenuStyles.desktopLayout}>
              {selectedProduct && !productHeroCollapsed ? (
                <button
                  type="button"
                  className={styles.desktopDetailBack}
                  aria-label="Volver al menú"
                  onClick={onProductClose}
                >
                  <ArrowBackIcon fontSize="small" />
                </button>
              ) : null}
              {selectedProduct ? (
                <header
                  className={`${menuStyles.compactHeader} ${styles.desktopProductCompactHeader} ${
                    productHeroCollapsed ? menuStyles.compactHeaderVisible : ''
                  }`}
                  aria-hidden={!productHeroCollapsed}
                >
                  {productHeroCollapsed ? (
                    <button
                      type="button"
                      className={menuStyles.compactIconBtn}
                      aria-label="Volver al menú"
                      onClick={onProductClose}
                    >
                      <ArrowBackIcon fontSize="small" />
                    </button>
                  ) : null}
                  <span className={menuStyles.compactTitle}>{selectedProduct.name}</span>
                </header>
              ) : null}
              <DigitalMenuEditorDesktopLayout
                restaurant={restaurant}
                displayCategories={displayCategories}
                products={products}
                schedules={schedules}
                enabledServices={enabledServices}
                productDiscounts={productDiscounts}
                productTimeLimitedPromotions={productTimeLimitedPromotions}
                promotionShortcuts={promotionShortcuts}
                promotionTimezone={promotionTimezone}
                countdownContext={countdownContext}
                logoUrl={logoUrl}
                coverUrl={coverUrl}
                activeCategoryId={activeCategoryId}
                dragCategoryId={dragCategoryId}
                dropCategoryId={dropCategoryId}
                productDragTarget={productDragTarget}
                productDropTarget={productDropTarget}
                sectionRefs={sectionRefs}
                scrollRef={desktopScrollRef}
                coverInputRef={coverInputRef}
                logoInputRef={logoInputRef}
                themeStyle={menuThemeStyle}
                onCategorySelect={handleDesktopCategorySelect}
                onDragCategoryIdChange={onDragCategoryIdChange}
                onDropCategoryIdChange={onDropCategoryIdChange}
                onCategoryDrop={onCategoryDrop}
                onProductDragTargetChange={onProductDragTargetChange}
                onProductDropTargetChange={onProductDropTargetChange}
                onProductDrop={onProductDrop}
                onProductClick={onProductClick}
                onNameBlur={onNameBlur}
                onDescriptionBlur={onDescriptionBlur}
                onAssetUpload={onAssetUpload}
              >
                {selectedProduct ? (
                  <DigitalMenuProductDetail
                    key={selectedProduct.id}
                    product={selectedProduct}
                    discount={productDiscounts.get(selectedProduct.id)}
                    timeLimitedPromotion={
                      productTimeLimitedPromotions.get(selectedProduct.id) ?? null
                    }
                    promotionTimezone={promotionTimezone}
                    countdownContext={countdownContext}
                    heroCollapsed={productHeroCollapsed}
                    onHeroCollapsedChange={onProductHeroCollapsedChange}
                    scrollRootRef={desktopScrollRef}
                    onBack={onProductClose}
                    onAddToCart={() => {}}
                    onReorderGroups={onReorderOptionGroups}
                    onReorderItems={onReorderOptionItems}
                    hideHeroBackButton
                  />
                ) : undefined}
              </DigitalMenuEditorDesktopLayout>
            </div>
          ) : (
            <div
              className={`${menuStyles.phone} ${menuStyles.publicRoot} ${
                isTabletLayout ? menuStyles.publicTablet : ''
              } ${styles.editorPhone}`}
              style={menuThemeStyle}
              data-cat-tabs={categoryTabStyle}
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
                    onClick={onProductClose}
                  >
                    <ArrowBackIcon fontSize="small" />
                  </button>
                  <span className={menuStyles.compactTitle}>{selectedProduct.name}</span>
                </header>
              ) : (
                <header
                  className={`${menuStyles.compactHeader} ${
                    heroCollapsed ? menuStyles.compactHeaderVisible : ''
                  }`}
                  aria-hidden={!heroCollapsed}
                >
                  <span className={menuStyles.compactTitle}>{restaurant.name}</span>
                </header>
              )}

              <div
                ref={mobileScrollRef}
                className={`${menuStyles.phoneScroll} ${publicMenuStyles.mobileScroll} ${
                  selectedProduct ? menuStyles.phoneScrollDetail : ''
                }`}
                onScroll={selectedProduct ? undefined : handlePhoneScroll}
              >
                {selectedProduct ? (
                  <DigitalMenuProductDetail
                    product={selectedProduct}
                    discount={productDiscounts.get(selectedProduct.id)}
                    timeLimitedPromotion={productTimeLimitedPromotions.get(selectedProduct.id) ?? null}
                    promotionTimezone={promotionTimezone}
                    countdownContext={countdownContext}
                    heroCollapsed={productHeroCollapsed}
                    onHeroCollapsedChange={onProductHeroCollapsedChange}
                    scrollRootRef={mobileScrollRef}
                    onBack={onProductClose}
                    onAddToCart={() => {}}
                    onReorderGroups={onReorderOptionGroups}
                    onReorderItems={onReorderOptionItems}
                    isTabletLayout={isTabletLayout}
                    editorPreviewDevice={previewDevice}
                  />
                ) : (
                  <>
                    <DigitalMenuEditorHero
                      restaurant={restaurant}
                      schedules={schedules}
                      enabledServices={enabledServices}
                      logoUrl={logoUrl}
                      coverUrl={coverUrl}
                      menuUrl={menuUrl}
                      heroSentinelRef={heroSentinelRef}
                      showFloatControls={showFloatControls}
                      coverInputRef={coverInputRef}
                      logoInputRef={logoInputRef}
                      onNameBlur={onNameBlur}
                      onDescriptionBlur={onDescriptionBlur}
                      onAssetUpload={onAssetUpload}
                    />

                    {displayCategories.length === 0 ? (
                      <div className={menuStyles.emptyCategories}>
                        Crea categorías en Productos para ver tu menú aquí
                      </div>
                    ) : (
                      <>
                        <DigitalMenuEditorCategoryBar
                          displayCategories={displayCategories}
                          activeCategoryId={activeCategoryId}
                          heroCollapsed={heroCollapsed}
                          dragCategoryId={dragCategoryId}
                          dropCategoryId={dropCategoryId}
                          categoryBarRef={categoryBarRef}
                          onDragCategoryIdChange={onDragCategoryIdChange}
                          onDropCategoryIdChange={onDropCategoryIdChange}
                          onCategoryDrop={onCategoryDrop}
                          onCategorySelect={handleMobileCategorySelect}
                        />

                        <DigitalMenuEditorCategorySections
                          displayCategories={displayCategories}
                          products={products}
                          productDiscounts={productDiscounts}
                          productTimeLimitedPromotions={productTimeLimitedPromotions}
                          promotionShortcuts={promotionShortcuts}
                          promotionTimezone={promotionTimezone}
                          countdownContext={countdownContext}
                          sectionRefs={sectionRefs}
                          isTabletLayout={isTabletLayout}
                          promotionBannerViewport={promotionBannerViewport}
                          productDragTarget={productDragTarget}
                          productDropTarget={productDropTarget}
                          onProductDragTargetChange={onProductDragTargetChange}
                          onProductDropTargetChange={onProductDropTargetChange}
                          onProductDrop={onProductDrop}
                          onProductClick={onProductClick}
                          onLayoutChange={onLayoutChange}
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
                      className={isTabletLayout ? menuStyles.tabletInsetSection : undefined}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className={styles.previewHint}>
        Arrastra categorías, productos y complementos para reordenar. El contenido coincide con tu menú
        en vivo.
      </p>
    </div>
  );
}
