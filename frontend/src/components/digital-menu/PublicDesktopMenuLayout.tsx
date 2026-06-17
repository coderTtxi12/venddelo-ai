'use client';

import type { Category, Product, RestaurantSchedule } from '@/lib/api/types';
import {
  ProductPrice,
  ProductThumb,
  productsForCategory,
} from '@/components/digital-menu/menuProductUi';
import { RestaurantHoursDisplay } from '@/components/digital-menu/RestaurantHoursDisplay';
import { RestaurantLocationSection } from '@/components/digital-menu/RestaurantLocationSection';
import { RestaurantOpenStatusBadge } from '@/components/digital-menu/RestaurantOpenStatusBadge';
import { RestaurantServiceChips } from '@/components/digital-menu/RestaurantServiceChips';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PublicRestaurant } from '@/lib/api/public';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import styles from './PublicDesktopMenuLayout.module.css';

type PublicDesktopMenuLayoutProps = {
  restaurant: PublicRestaurant;
  categories: Category[];
  products: Product[];
  schedules: RestaurantSchedule[];
  enabledServices: RestaurantServiceType[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  logoUrl: string | null;
  coverUrl: string | null;
  activeCategoryId: string | null;
  onCategorySelect: (categoryId: string) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onProductClick: (productId: string) => void;
  cartItemCount?: number;
  onOpenCart?: () => void;
  children?: React.ReactNode;
};

export function PublicDesktopMenuLayout({
  restaurant,
  categories,
  products,
  schedules,
  enabledServices,
  productDiscounts,
  logoUrl,
  coverUrl,
  activeCategoryId,
  onCategorySelect,
  sectionRefs,
  scrollRef,
  onProductClick,
  cartItemCount = 0,
  onOpenCart,
  children,
}: PublicDesktopMenuLayoutProps) {
  return (
    <div className={styles.layout}>
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
                <RestaurantOpenStatusBadge schedules={schedules} services={enabledServices} />
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

          {categories.length > 0 ? (
            <nav className={styles.categoryNav} aria-label="Categorías del menú">
              {categories.map((cat) => (
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
                serviceTypes={enabledServices}
                variant="sidebar"
              />
              <RestaurantLocationSection restaurant={restaurant} variant="sidebar" />
            </div>
          </div>
        </div>
      </aside>

      <main ref={scrollRef} className={styles.main} aria-label="Menú">
        {children ?? (
          <>
            {categories.length === 0 ? (
              <p className={styles.empty}>Este menú aún no tiene categorías.</p>
            ) : (
              categories.map((cat) => {
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
                            className={styles.productCard}
                            onClick={() => onProductClick(product.id)}
                            aria-label={`Ver ${product.name}`}
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
                                />
                              </div>
                            </div>
                            <ProductThumb product={product} className={styles.productThumb} />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </>
        )}
      </main>
    </div>
  );
}
