'use client';

import type { CSSProperties, MutableRefObject } from 'react';
import { useEffect, useState } from 'react';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import type { Category, Product, Promotion, RestaurantSchedule } from '@/lib/api/types';
import {
  ProductListThumb,
  ProductPrice,
  isProductAvailable,
  productAriaLabel,
  productsForCategory,
} from '@/components/digital-menu/menuProductUi';
import { PromotionShortcutBanners } from '@/components/digital-menu/PromotionShortcutBanners';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import { RestaurantHoursDisplay } from '@/components/digital-menu/RestaurantHoursDisplay';
import { RestaurantLocationSection } from '@/components/digital-menu/RestaurantLocationSection';
import { RestaurantOpenStatusBadge } from '@/components/digital-menu/RestaurantOpenStatusBadge';
import { RestaurantServiceChips } from '@/components/digital-menu/RestaurantServiceChips';
import {
  getDigitalMenuSpecialCategoryKind,
  productsForLimitedTimeCategory,
} from '@/lib/digital-menu/specialCategories';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PublicRestaurant } from '@/lib/api/public';
import { PUBLIC_MENU_SCHEDULE_SERVICE_TYPES, type RestaurantServiceType } from '@/lib/restaurantServices';
import styles from './PublicDesktopMenuLayout.module.css';

type PublicDesktopMenuLayoutProps = {
  restaurant: PublicRestaurant;
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
  onCategorySelect: (categoryId: string) => void;
  onPromotionSelect: (promotionId: string) => void;
  sectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onProductClick: (productId: string) => void;
  cartItemCount?: number;
  onOpenCart?: () => void;
  onOpenSearch?: () => void;
  children?: React.ReactNode;
  themeStyle?: CSSProperties;
};

export function PublicDesktopMenuLayout({
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
  onCategorySelect,
  onPromotionSelect,
  sectionRefs,
  scrollRef,
  onProductClick,
  cartItemCount = 0,
  onOpenCart,
  onOpenSearch,
  children,
  themeStyle,
}: PublicDesktopMenuLayoutProps) {
  const [searchShortcut, setSearchShortcut] = useState('⌘K');

  useEffect(() => {
    const isApple =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    setSearchShortcut(isApple ? '⌘K' : 'Ctrl+K');
  }, []);

  return (
    <div className={styles.layout} style={themeStyle}>
      <aside className={styles.sidebar} aria-label="Información y categorías">
        <div className={styles.sidebarCover}>
          {coverUrl ? (
            <img src={coverUrl} alt="" className={styles.sidebarCoverImage} />
          ) : (
            <div className={styles.sidebarCoverPlaceholder} aria-hidden />
          )}
        </div>

        <div className={styles.sidebarScroll}>
          <div className={styles.sidebarBody}>
            <div className={styles.brandRow}>
              <div className={styles.logoWrap}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className={styles.logoImage} />
                ) : (
                  <div className={styles.logoPlaceholder}>
                    {(restaurant.name.trim()[0] ?? '?').toUpperCase()}
                  </div>
                )}
              </div>
              <div className={styles.brandMeta}>
                <h1 className={styles.restaurantName}>{restaurant.name}</h1>
                <RestaurantOpenStatusBadge schedules={schedules} services={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES} />
              </div>
            </div>

            {(restaurant.description || enabledServices.length > 0) ? (
              <div className={styles.restaurantMeta}>
                {restaurant.description ? (
                  <p className={styles.restaurantDescription}>{restaurant.description}</p>
                ) : null}
                <RestaurantServiceChips
                  services={enabledServices}
                  className={styles.restaurantServiceList}
                />
              </div>
            ) : null}

            {onOpenSearch ? (
              <div className={styles.searchWrap}>
                <button
                  type="button"
                  className={styles.searchTrigger}
                  onClick={onOpenSearch}
                  aria-label="Buscar en el menú"
                >
                  <SearchOutlinedIcon fontSize="small" className={styles.searchTriggerIcon} aria-hidden />
                  <span className={styles.searchTriggerLabel}>Buscar en el menú</span>
                  <kbd className={styles.searchShortcut} aria-hidden>
                    {searchShortcut}
                  </kbd>
                </button>
              </div>
            ) : null}

            {displayCategories.length > 0 ? (
              <nav className={styles.categoryNav} aria-label="Categorías del menú">
                {displayCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`${styles.categoryNavItem} ${
                      activeCategoryId === cat.id ? styles.categoryNavItemActive : ''
                    }`}
                    onClick={() => onCategorySelect(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </nav>
            ) : null}

            {onOpenCart ? (
              <button type="button" className={styles.cartNavBtn} onClick={onOpenCart}>
                <span>Carrito</span>
                {cartItemCount > 0 ? (
                  <span className={styles.cartNavBadge} aria-label={`${cartItemCount} artículos`}>
                    {cartItemCount}
                  </span>
                ) : null}
              </button>
            ) : null}

            <div className={styles.sidebarFooter}>
              <RestaurantHoursDisplay
                schedules={schedules}
                serviceTypes={PUBLIC_MENU_SCHEDULE_SERVICE_TYPES}
                variant="sidebar"
                flat
              />
              <RestaurantLocationSection restaurant={restaurant} variant="sidebar" />
            </div>
          </div>
        </div>
      </aside>

      <main ref={scrollRef} className={styles.main} aria-label="Menú">
        {children ?? (
          displayCategories.length === 0 ? (
            <p className={styles.empty}>Este menú aún no tiene categorías.</p>
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
                    onSelect={onPromotionSelect}
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
                    data-category-id={cat.id}
                    ref={(el) => {
                      sectionRefs.current[cat.id] = el;
                    }}
                    className={styles.section}
                  >
                    <h2 className={styles.sectionTitle}>{cat.name}</h2>
                    {limitedProducts.length === 0 ? (
                      <p className={styles.emptySection}>Sin productos en promoción por ahora.</p>
                    ) : (
                      <div className={styles.limitedTimeTrack} aria-label={cat.name}>
                        {limitedProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className={`${styles.limitedTimeCard} ${
                              !isProductAvailable(product) ? styles.productUnavailable : ''
                            }`}
                            onClick={() => onProductClick(product.id)}
                            aria-label={productAriaLabel(product)}
                          >
                            <ProductListThumb
                              product={product}
                              className={styles.limitedTimeThumb}
                            />
                            <div className={styles.limitedTimeBody}>
                              <span className={styles.productName}>{product.name}</span>
                              {product.description ? (
                                <span className={styles.productDesc}>{product.description}</span>
                              ) : null}
                              <div className={styles.productPriceWrap}>
                                <ProductPrice
                                  product={product}
                                  discount={productDiscounts.get(product.id)}
                                  timeLimitedPromotion={productTimeLimitedPromotions.get(product.id)}
                                  promotionTimezone={promotionTimezone}
                                  countdownContext={countdownContext}
                                />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                );
              }

              const catProducts = productsForCategory(products, cat.id);
              return (
                <section
                  key={cat.id}
                  id={`menu-section-${cat.id}`}
                  data-category-id={cat.id}
                  ref={(el) => {
                    sectionRefs.current[cat.id] = el;
                  }}
                  className={styles.section}
                >
                  <h2 className={styles.sectionTitle}>{cat.name}</h2>
                  {catProducts.length === 0 ? (
                    <p className={styles.emptySection}>Sin productos en esta categoría.</p>
                  ) : (
                    <div className={styles.productGrid}>
                      {catProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className={`${styles.productCard} ${
                            !isProductAvailable(product) ? styles.productUnavailable : ''
                          }`}
                          onClick={() => onProductClick(product.id)}
                          aria-label={productAriaLabel(product)}
                        >
                          <div className={styles.productBody}>
                            <span className={styles.productName}>{product.name}</span>
                            {product.description ? (
                              <span className={styles.productDesc}>{product.description}</span>
                            ) : null}
                            <div className={styles.productPriceWrap}>
                              <ProductPrice
                                product={product}
                                discount={productDiscounts.get(product.id)}
                                timeLimitedPromotion={productTimeLimitedPromotions.get(product.id)}
                                promotionTimezone={promotionTimezone}
                                countdownContext={countdownContext}
                              />
                            </div>
                          </div>
                          <ProductListThumb product={product} className={menuStyles.productThumb} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )
        )}
      </main>
    </div>
  );
}
