'use client';

import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import type { CSSProperties, MutableRefObject, ReactNode, RefObject } from 'react';
import type { Category, Product, Promotion, Restaurant, RestaurantSchedule } from '@/lib/api/types';
import { ProductList, productsForCategory } from '@/components/digital-menu/menuProductUi';
import { PromotionShortcutBanners } from '@/components/digital-menu/PromotionShortcutBanners';
import {
  SortableProductList,
  type ProductDragTarget,
} from '@/components/digital-menu/SortableProductList';
import { RestaurantHoursDisplay } from '@/components/digital-menu/RestaurantHoursDisplay';
import { RestaurantLocationSection } from '@/components/digital-menu/RestaurantLocationSection';
import { LiveMenuSocialLinks } from '@/components/digital-menu/LiveMenuSocialLinks';
import socialStyles from '@/components/digital-menu/RestaurantSocialLinksSection.module.css';
import {
  buildRestaurantSocialLinks,
  restaurantSocialLinkSourceFromRestaurant,
} from '@/lib/digital-menu/restaurantSocialLinks';
import { RestaurantOpenStatusBadge } from '@/components/digital-menu/RestaurantOpenStatusBadge';
import { RestaurantServiceChips } from '@/components/digital-menu/RestaurantServiceChips';
import {
  getDigitalMenuSpecialCategoryKind,
  isDigitalMenuSpecialCategoryId,
  productsForLimitedTimeCategory,
} from '@/lib/digital-menu/specialCategories';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { PUBLIC_MENU_SCHEDULE_SERVICE_TYPES, type RestaurantServiceType } from '@/lib/restaurantServices';
import { attachDragOverlay } from '@/lib/dragOverlay';
import desktopStyles from '@/components/digital-menu/PublicDesktopMenuLayout.module.css';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import editorStyles from './DigitalMenuEditorPreview.module.css';

type DigitalMenuEditorDesktopLayoutProps = {
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
  activeCategoryId: string | null;
  dragCategoryId: string | null;
  dropCategoryId: string | null;
  productDragTarget: ProductDragTarget;
  productDropTarget: ProductDragTarget;
  sectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  scrollRef: RefObject<HTMLDivElement | null>;
  coverInputRef: RefObject<HTMLInputElement | null>;
  logoInputRef: RefObject<HTMLInputElement | null>;
  themeStyle?: CSSProperties;
  onCategorySelect: (categoryId: string) => void;
  onDragCategoryIdChange: (categoryId: string | null) => void;
  onDropCategoryIdChange: (categoryId: string | null) => void;
  onCategoryDrop: (targetId: string) => void;
  onProductDragTargetChange: (target: ProductDragTarget) => void;
  onProductDropTargetChange: (target: ProductDragTarget) => void;
  onProductDrop: (categoryId: string, targetProductId: string) => void;
  onProductClick: (productId: string) => void;
  onNameBlur: (value: string) => void;
  onDescriptionBlur: (value: string) => void;
  onAssetUpload: (folder: 'logo' | 'cover', file: File) => void;
  children?: ReactNode;
};

export function DigitalMenuEditorDesktopLayout({
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
  activeCategoryId,
  dragCategoryId,
  dropCategoryId,
  productDragTarget,
  productDropTarget,
  sectionRefs,
  scrollRef,
  coverInputRef,
  logoInputRef,
  themeStyle,
  onCategorySelect,
  onDragCategoryIdChange,
  onDropCategoryIdChange,
  onCategoryDrop,
  onProductDragTargetChange,
  onProductDropTargetChange,
  onProductDrop,
  onProductClick,
  onNameBlur,
  onDescriptionBlur,
  onAssetUpload,
  children,
}: DigitalMenuEditorDesktopLayoutProps) {
  const socialLinks = buildRestaurantSocialLinks(restaurantSocialLinkSourceFromRestaurant(restaurant));

  return (
    <div className={desktopStyles.layout} style={themeStyle}>
      <aside className={desktopStyles.sidebar} aria-label="Información y categorías">
        <div className={`${desktopStyles.sidebarCover} ${editorStyles.editableCover}`}>
          {coverUrl ? (
            <img src={coverUrl} alt="" className={desktopStyles.sidebarCoverImage} />
          ) : (
            <div className={desktopStyles.sidebarCoverPlaceholder} aria-hidden />
          )}
          <button
            type="button"
            className={editorStyles.assetEditOverlay}
            onClick={() => coverInputRef.current?.click()}
          >
            {coverUrl ? 'Cambiar portada' : 'Subir portada'}
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className={menuStyles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAssetUpload('cover', file);
              e.target.value = '';
            }}
          />
          <LiveMenuSocialLinks
            socialLinks={socialLinks}
            placement={restaurant.live_menu_social_placement}
            slot="cover"
          />
        </div>

        <div className={desktopStyles.sidebarScroll}>
          <div className={desktopStyles.sidebarBody}>
            <div className={desktopStyles.brandRow}>
              <div className={`${desktopStyles.logoWrap} ${editorStyles.editableLogo}`}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className={desktopStyles.logoImage} />
                ) : (
                  <div className={desktopStyles.logoPlaceholder}>
                    {(restaurant.name.trim()[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  className={editorStyles.assetEditOverlay}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoUrl ? 'Logo' : 'Subir'}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className={menuStyles.hiddenInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAssetUpload('logo', file);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className={desktopStyles.brandMeta}>
                <input
                  className={editorStyles.desktopNameInput}
                  defaultValue={restaurant.name}
                  key={restaurant.id + restaurant.name}
                  aria-label="Nombre del restaurante"
                  onBlur={(e) => onNameBlur(e.target.value)}
                />
                <RestaurantOpenStatusBadge
                  schedules={schedules}
                  services={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES}
                />
              </div>
            </div>

            <div className={editorStyles.desktopDescriptionWrap}>
              <textarea
                className={editorStyles.desktopDescriptionInput}
                defaultValue={restaurant.description ?? ''}
                key={`${restaurant.id}-desc-${restaurant.description ?? ''}`}
                aria-label="Descripción del restaurante"
                placeholder="Describe tu restaurante…"
                rows={2}
                onBlur={(e) => onDescriptionBlur(e.target.value)}
              />
            </div>

            {enabledServices.length > 0 ? (
              <div className={desktopStyles.restaurantMeta}>
                <RestaurantServiceChips
                  services={enabledServices}
                  className={desktopStyles.restaurantServiceList}
                />
              </div>
            ) : null}

            <LiveMenuSocialLinks
              socialLinks={socialLinks}
              placement={restaurant.live_menu_social_placement}
              slot="intro"
              className={socialStyles.socialSectionIntroSidebar}
            />

            <div className={desktopStyles.searchWrap}>
              <div className={desktopStyles.searchTrigger} aria-hidden>
                <SearchOutlinedIcon fontSize="small" className={desktopStyles.searchTriggerIcon} />
                <span className={desktopStyles.searchTriggerLabel}>Buscar en el menú</span>
              </div>
            </div>

            {displayCategories.length > 0 ? (
              <nav className={desktopStyles.categoryNav} aria-label="Categorías del menú">
                {displayCategories.map((cat) => {
                  const isSpecial = isDigitalMenuSpecialCategoryId(cat.id);

                  return (
                    <div
                      key={cat.id}
                      className={`${editorStyles.categoryNavRow} ${
                        !isSpecial && dragCategoryId === cat.id ? editorStyles.categoryNavDragging : ''
                      } ${
                        !isSpecial && dropCategoryId === cat.id && dragCategoryId !== cat.id
                          ? editorStyles.categoryNavDropTarget
                          : ''
                      }`}
                      onDragOver={(e) => {
                        if (isSpecial) return;
                        e.preventDefault();
                        if (dragCategoryId && dragCategoryId !== cat.id) {
                          onDropCategoryIdChange(cat.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dropCategoryId === cat.id) onDropCategoryIdChange(null);
                      }}
                      onDrop={(e) => {
                        if (isSpecial) return;
                        e.preventDefault();
                        onCategoryDrop(cat.id);
                      }}
                    >
                      {!isSpecial ? (
                        <button
                          type="button"
                          className={editorStyles.categoryNavDrag}
                          draggable
                          aria-label={`Reordenar categoría ${cat.name}`}
                          title="Arrastrar para reordenar"
                          onDragStart={(e) => {
                            const row = (e.currentTarget as HTMLElement).closest(
                              `.${editorStyles.categoryNavRow}`,
                            );
                            if (row instanceof HTMLElement) {
                              attachDragOverlay(e, row, {
                                offsetX: 20,
                                offsetY: 16,
                                overlayClassName: menuStyles.dragOverlayClone,
                                bodyDraggingClassName: menuStyles.bodyDragging,
                              });
                            }
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', cat.id);
                            onDragCategoryIdChange(cat.id);
                          }}
                          onDragEnd={() => {
                            onDragCategoryIdChange(null);
                            onDropCategoryIdChange(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DragIndicatorIcon sx={{ fontSize: 16 }} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`${desktopStyles.categoryNavItem} ${
                          activeCategoryId === cat.id ? desktopStyles.categoryNavItemActive : ''
                        }`}
                        onClick={() => onCategorySelect(cat.id)}
                      >
                        {cat.name}
                      </button>
                    </div>
                  );
                })}
              </nav>
            ) : null}

            <div className={desktopStyles.sidebarFooter}>
              <RestaurantHoursDisplay
                schedules={schedules}
                serviceTypes={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES}
                variant="sidebar"
                flat
              />
              <RestaurantLocationSection restaurant={restaurant} variant="sidebar" />
              <LiveMenuSocialLinks
                socialLinks={socialLinks}
                placement={restaurant.live_menu_social_placement}
                slot="footer"
                variant="sidebar"
              />
            </div>
          </div>
        </div>
      </aside>

      <main ref={scrollRef} className={desktopStyles.main} aria-label="Menú">
        <LiveMenuSocialLinks
          socialLinks={socialLinks}
          placement={restaurant.live_menu_social_placement}
          slot="before_menu"
          className={socialStyles.socialSectionBeforeMenuDesktop}
        />
        {children ??
          (displayCategories.length === 0 ? (
            <p className={desktopStyles.empty}>Crea categorías en Productos para ver tu menú aquí</p>
          ) : (
            displayCategories.map((cat) => {
            const kind = getDigitalMenuSpecialCategoryKind(cat.id);

            if (kind === 'promotions') {
              return (
                <PromotionShortcutBanners
                  key={cat.id}
                  promotions={promotionShortcuts}
                  viewport="desktop"
                  timezone={promotionTimezone}
                  countdownContext={countdownContext}
                  onSelect={() => {}}
                  title={cat.name}
                  sectionId={`menu-section-${cat.id}`}
                  categoryId={cat.id}
                  sectionRef={(el) => {
                    sectionRefs.current[cat.id] = el;
                  }}
                />
              );
            }

            if (kind === 'limited_time') {
              const limitedProducts = productsForLimitedTimeCategory(products, productDiscounts);
              return (
                <section
                  key={cat.id}
                  id={`menu-section-${cat.id}`}
                  ref={(el) => {
                    sectionRefs.current[cat.id] = el;
                  }}
                  className={desktopStyles.section}
                >
                  <h2 className={desktopStyles.sectionTitle}>{cat.name}</h2>
                  <ProductList
                    layout="horizontal"
                    products={limitedProducts}
                    productDiscounts={productDiscounts}
                    productTimeLimitedPromotions={productTimeLimitedPromotions}
                    promotionTimezone={promotionTimezone}
                    countdownContext={countdownContext}
                    onProductClick={onProductClick}
                  />
                </section>
              );
            }

            const catProducts = productsForCategory(products, cat.id);
            return (
              <section
                key={cat.id}
                id={`menu-section-${cat.id}`}
                ref={(el) => {
                  sectionRefs.current[cat.id] = el;
                }}
                className={desktopStyles.section}
              >
                <h2 className={desktopStyles.sectionTitle}>{cat.name}</h2>
                <SortableProductList
                  categoryId={cat.id}
                  layout="desktop"
                  products={catProducts}
                  productDiscounts={productDiscounts}
                  dragTarget={productDragTarget}
                  dropTarget={productDropTarget}
                  onDragTargetChange={onProductDragTargetChange}
                  onDropTargetChange={onProductDropTargetChange}
                  onProductDrop={onProductDrop}
                  onProductClick={onProductClick}
                />
              </section>
            );
          })
          ))}
      </main>
    </div>
  );
}
