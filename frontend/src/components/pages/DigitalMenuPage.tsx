'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listCategories, listProducts, setCategoryProductOrder, updateCategory, updateOptionGroup, updateOptionItem } from '@/lib/api/menu';
import { fetchAllPages } from '@/lib/api/pagination';
import { listAllPromotions } from '@/lib/api/promotions';
import { getRestaurant, listRestaurantSchedules, updateRestaurant } from '@/lib/api/restaurants';
import {
  ApiError,
  type Category,
  type CategoryDisplayLayout,
  type OptionGroup,
  type Product,
  type Promotion,
  type Restaurant,
  type RestaurantSchedule,
} from '@/lib/api/types';
import { buildMenuProductDiscountMap } from '@/lib/promotions/menuProductDiscount';
import { buildProductTimeLimitedPromotionMap } from '@/lib/promotions/promotionCountdown';
import { listLivePromotionShortcuts } from '@/lib/promotions/promotionShortcuts';
import {
  buildDigitalMenuDisplayCategories,
  digitalMenuSpecialCategoryConfigFromRestaurant,
  isDigitalMenuSpecialCategoryId,
  type DigitalMenuSpecialCategoryConfig,
} from '@/lib/digital-menu/specialCategories';
import { arrayMove } from '@/lib/arrayMove';
import { DigitalMenuEditorPreview } from '@/components/digital-menu/DigitalMenuEditorPreview';
import { DigitalMenuQrDialog } from '@/components/digital-menu/DigitalMenuQrDialog';
import { DigitalMenuSpecialCategoriesPanel } from '@/components/digital-menu/DigitalMenuSpecialCategoriesPanel';
import { DigitalMenuThemePicker } from '@/components/digital-menu/DigitalMenuThemePicker';
import type { ProductDragTarget } from '@/components/digital-menu/SortableProductList';
import { productsForCategory, sortCategories } from '@/components/digital-menu/menuProductUi';
import {
  DEFAULT_DIGITAL_MENU_THEME_ID,
  getDigitalMenuThemeOrDefault,
  loadDigitalMenuThemeFonts,
  digitalMenuThemeToStyle,
} from '@/lib/digital-menu/themes';
import { resolveRestaurantServices, type RestaurantServiceType } from '@/lib/restaurantServices';
import { restaurantPublicMenuUrl } from '@/lib/restaurantSubdomain';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { uploadRestaurantAsset } from '@/lib/storage/upload';
import { useAuth } from '@/hooks/useAuth';
import { resolveSupplierIdByEmail } from '@/services/db';
import { legacyDb as db } from '@/services/legacyDb';
import styles from './DigitalMenuPage.module.css';

const LAYOUTS: CategoryDisplayLayout[] = ['vertical', 'horizontal', 'grid'];

function pickRandomLayout(): CategoryDisplayLayout {
  return LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)]!;
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
  const [productDragTarget, setProductDragTarget] = useState<ProductDragTarget>(null);
  const [productDropTarget, setProductDropTarget] = useState<ProductDragTarget>(null);
  const [themeId, setThemeId] = useState(DEFAULT_DIGITAL_MENU_THEME_ID);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productHeroCollapsed, setProductHeroCollapsed] = useState(false);
  const [enabledServices, setEnabledServices] = useState<RestaurantServiceType[]>([]);
  const [schedules, setSchedules] = useState<RestaurantSchedule[]>([]);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const menuTheme = useMemo(() => getDigitalMenuThemeOrDefault(themeId), [themeId]);
  const menuThemeStyle = useMemo(() => digitalMenuThemeToStyle(menuTheme), [menuTheme]);
  const promotionTimezone = 'America/Mexico_City';

  useEffect(() => {
    loadDigitalMenuThemeFonts(menuTheme);
  }, [menuTheme]);

  const handleThemeChange = useCallback(
    async (nextThemeId: string) => {
      const resolvedThemeId = getDigitalMenuThemeOrDefault(nextThemeId).id;
      if (!accessToken || !restaurantId) {
        setThemeId(resolvedThemeId);
        return;
      }

      const previousThemeId = themeId;
      setThemeId(resolvedThemeId);

      try {
        const updated = await updateRestaurant(accessToken, restaurantId, {
          digital_menu_theme_id: resolvedThemeId,
        });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
        setThemeId(previousThemeId);
      }
    },
    [accessToken, restaurantId, themeId],
  );

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
          { userId: firebaseUser?.uid },
        );
        if ('error' in resolved) {
          if (!cancelled) {
            setLoadError(resolved.error);
            setLoading(false);
          }
          return;
        }

        const rid = resolved.supplierId;
        const [restaurantData, categoryRows, productRows, promotionRows, scheduleRows] =
          await Promise.all([
            getRestaurant(accessToken, rid),
            fetchAllPages((cursor) => listCategories(accessToken, rid, 100, cursor)),
            fetchAllPages((cursor) => listProducts(accessToken, rid, 100, cursor)),
            listAllPromotions(accessToken, rid),
            listRestaurantSchedules(accessToken, rid),
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
        setSchedules(scheduleRows);
        setEnabledServices(resolveRestaurantServices(restaurantData));
        setThemeId(getDigitalMenuThemeOrDefault(restaurantData.digital_menu_theme_id).id);
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
    () => buildMenuProductDiscountMap(products, promotions, new Date(), promotionTimezone),
    [products, promotions, promotionTimezone],
  );

  const promotionCountdownContext = useMemo(
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
        promotions,
        new Date(),
        promotionTimezone,
        promotionCountdownContext,
      ),
    [products, promotions, promotionTimezone, promotionCountdownContext],
  );

  const specialCategoryConfig = useMemo(
    () => digitalMenuSpecialCategoryConfigFromRestaurant(restaurant),
    [restaurant],
  );

  const promotionShortcuts = useMemo(
    () => listLivePromotionShortcuts(promotions, products, new Date(), promotionTimezone),
    [promotions, products, promotionTimezone],
  );

  const displayCategories = useMemo(
    () =>
      buildDigitalMenuDisplayCategories(categories, {
        config: specialCategoryConfig,
        restaurantId: restaurantId ?? 'preview',
        hasPromotionShortcuts: promotionShortcuts.length > 0,
        hasLimitedTimeProducts: productDiscounts.size > 0,
      }),
    [
      categories,
      specialCategoryConfig,
      restaurantId,
      promotionShortcuts.length,
      productDiscounts.size,
    ],
  );

  const persistSpecialCategoryConfig = useCallback(
    async (patch: Partial<DigitalMenuSpecialCategoryConfig>) => {
      if (!accessToken || !restaurantId || !restaurant) return;

      const nextConfig = { ...specialCategoryConfig, ...patch };
      try {
        const updated = await updateRestaurant(accessToken, restaurantId, {
          digital_menu_promotions_category_enabled: nextConfig.promotionsCategoryEnabled,
          digital_menu_promotions_category_name: nextConfig.promotionsCategoryName,
          digital_menu_limited_time_category_enabled: nextConfig.limitedTimeCategoryEnabled,
          digital_menu_limited_time_category_name: nextConfig.limitedTimeCategoryName,
        });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
      }
    },
    [accessToken, restaurant, restaurantId, specialCategoryConfig],
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
      if (isDigitalMenuSpecialCategoryId(targetId)) return;
      if (!dragCategoryId || dragCategoryId === targetId || isDigitalMenuSpecialCategoryId(dragCategoryId)) {
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

  const persistCategoryProductOrder = useCallback(
    async (categoryId: string, orderedProductIds: string[]) => {
      if (!accessToken || !restaurantId) return;
      await setCategoryProductOrder(accessToken, restaurantId, categoryId, orderedProductIds);
    },
    [accessToken, restaurantId],
  );

  const applyCategoryProductOrder = useCallback(
    (categoryId: string, orderedProductIds: string[]) => {
      setProducts((prev) =>
        prev.map((product) => {
          const nextIndex = orderedProductIds.indexOf(product.id);
          if (nextIndex < 0 || !product.category_ids.includes(categoryId)) return product;
          return {
            ...product,
            category_sort_indices: {
              ...product.category_sort_indices,
              [categoryId]: nextIndex,
            },
          };
        }),
      );
    },
    [],
  );

  const handleProductDrop = useCallback(
    async (categoryId: string, targetProductId: string) => {
      if (
        !productDragTarget ||
        productDragTarget.categoryId !== categoryId ||
        productDragTarget.productId === targetProductId
      ) {
        setProductDragTarget(null);
        setProductDropTarget(null);
        return;
      }

      const catProducts = productsForCategory(products, categoryId);
      const from = catProducts.findIndex(
        (product) => product.id === productDragTarget.productId,
      );
      const to = catProducts.findIndex((product) => product.id === targetProductId);
      if (from < 0 || to < 0) return;

      const reordered = arrayMove(catProducts, from, to);
      const orderedProductIds = reordered.map((product) => product.id);
      const previousProducts = products;

      applyCategoryProductOrder(categoryId, orderedProductIds);
      setProductDragTarget(null);
      setProductDropTarget(null);

      try {
        await persistCategoryProductOrder(categoryId, orderedProductIds);
      } catch (error) {
        console.error(error);
        setProducts(previousProducts);
      }
    },
    [
      applyCategoryProductOrder,
      persistCategoryProductOrder,
      productDragTarget,
      products,
    ],
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
      try {
        const updated = await updateRestaurant(accessToken, restaurantId, { name: trimmed });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
      }
    },
    [accessToken, restaurant, restaurantId],
  );

  const handleDescriptionBlur = useCallback(
    async (value: string) => {
      if (!accessToken || !restaurantId || !restaurant) return;
      const trimmed = value.trim();
      const current = restaurant.description?.trim() ?? '';
      if (trimmed === current) return;
      try {
        const updated = await updateRestaurant(accessToken, restaurantId, {
          description: trimmed || null,
        });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
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

  const openProduct = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setProductHeroCollapsed(false);
  }, []);

  const closeProduct = useCallback(() => {
    setSelectedProductId(null);
    setProductHeroCollapsed(false);
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

  const logoUrl = useMemo(() => storagePublicUrl(restaurant?.logo_path), [restaurant?.logo_path]);
  const coverUrl = useMemo(() => storagePublicUrl(restaurant?.cover_path), [restaurant?.cover_path]);
  const liveMenuUrl = useMemo(
    () => (restaurant ? restaurantPublicMenuUrl(restaurant.subdomain) : ''),
    [restaurant],
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
        <div className={styles.pageHeaderMain}>
          <h1 className={styles.title}>Menú Digital</h1>
          <p className={styles.subtitle}>
            Personaliza portada, logo, nombre, orden de categorías y productos, y cómo se muestran
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerActionBtn}
            onClick={() => setQrDialogOpen(true)}
          >
            Mostrar QR
          </button>
          <a
            href={liveMenuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.livePreviewBtn}
          >
            Ver en vivo
          </a>
        </div>
      </div>

      <DigitalMenuQrDialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        menuUrl={liveMenuUrl}
        restaurantName={restaurant.name}
      />

      <div className={styles.editorLayout}>
        <aside className={styles.settingsColumn}>
          <DigitalMenuThemePicker value={themeId} onChange={handleThemeChange} />
          <DigitalMenuSpecialCategoriesPanel
            config={specialCategoryConfig}
            onPromotionsEnabledChange={(enabled) => {
              void persistSpecialCategoryConfig({ promotionsCategoryEnabled: enabled });
            }}
            onPromotionsNameChange={(name) => {
              const trimmed = name.trim();
              if (!trimmed || trimmed === specialCategoryConfig.promotionsCategoryName) return;
              void persistSpecialCategoryConfig({ promotionsCategoryName: trimmed });
            }}
            onLimitedTimeEnabledChange={(enabled) => {
              void persistSpecialCategoryConfig({ limitedTimeCategoryEnabled: enabled });
            }}
            onLimitedTimeNameChange={(name) => {
              const trimmed = name.trim();
              if (!trimmed || trimmed === specialCategoryConfig.limitedTimeCategoryName) return;
              void persistSpecialCategoryConfig({ limitedTimeCategoryName: trimmed });
            }}
          />
        </aside>

        <div className={styles.previewColumn}>
          <DigitalMenuEditorPreview
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
            menuThemeStyle={menuThemeStyle}
            categoryTabStyle={menuTheme.style.categoryTabStyle}
            activeCategoryId={activeCategoryId}
            dragCategoryId={dragCategoryId}
            dropCategoryId={dropCategoryId}
            productDragTarget={productDragTarget}
            productDropTarget={productDropTarget}
            selectedProductId={selectedProductId}
            productHeroCollapsed={productHeroCollapsed}
            sectionRefs={sectionRefs}
            onActiveCategoryChange={setActiveCategoryId}
            onDragCategoryIdChange={setDragCategoryId}
            onDropCategoryIdChange={setDropCategoryId}
            onCategoryDrop={(targetId) => {
              void handleCategoryDrop(targetId);
            }}
            onProductDragTargetChange={setProductDragTarget}
            onProductDropTargetChange={setProductDropTarget}
            onProductDrop={(categoryId, targetProductId) => {
              void handleProductDrop(categoryId, targetProductId);
            }}
            onProductClick={openProduct}
            onProductClose={closeProduct}
            onProductHeroCollapsedChange={setProductHeroCollapsed}
            onLayoutChange={(categoryId, layout) => {
              void handleLayoutChange(categoryId, layout);
            }}
            onNameBlur={(value) => {
              void handleNameBlur(value);
            }}
            onDescriptionBlur={(value) => {
              void handleDescriptionBlur(value);
            }}
            onAssetUpload={(folder, file) => {
              void handleAssetUpload(folder, file);
            }}
            onReorderOptionGroups={handleReorderOptionGroups}
            onReorderOptionItems={handleReorderOptionItems}
          />
        </div>
      </div>
    </div>
  );
}
