'use client';

import type { MutableRefObject } from 'react';
import type { Category, Product, Promotion } from '@/lib/api/types';
import {
  ProductList,
  productsForCategory,
} from '@/components/digital-menu/menuProductUi';
import { PromotionShortcutBanners } from '@/components/digital-menu/PromotionShortcutBanners';
import {
  getDigitalMenuSpecialCategoryKind,
  productsForLimitedTimeCategory,
} from '@/lib/digital-menu/specialCategories';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';

type DigitalMenuCategorySectionsProps = {
  displayCategories: Category[];
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  productTimeLimitedPromotions: Map<string, Promotion>;
  promotionShortcuts: Promotion[];
  promotionTimezone: string;
  countdownContext: PromotionCountdownContext;
  sectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  isTabletLayout: boolean;
  promotionBannerViewport: 'mobile' | 'tablet' | 'desktop';
  onProductClick: (productId: string) => void;
  onPromotionSelect: (promotionId: string) => void;
  variant?: 'mobile';
};

export function DigitalMenuCategorySections({
  displayCategories,
  products,
  productDiscounts,
  productTimeLimitedPromotions,
  promotionShortcuts,
  promotionTimezone,
  countdownContext,
  sectionRefs,
  isTabletLayout,
  promotionBannerViewport,
  onProductClick,
  onPromotionSelect,
}: DigitalMenuCategorySectionsProps) {
  return (
    <>
      {displayCategories.map((cat) => {
        const kind = getDigitalMenuSpecialCategoryKind(cat.id);

        if (kind === 'promotions') {
          return (
            <PromotionShortcutBanners
              key={cat.id}
              promotions={promotionShortcuts}
              viewport={promotionBannerViewport}
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
              className={menuStyles.section}
            >
              <div className={menuStyles.sectionHeader}>
                <h2 className={menuStyles.sectionTitle}>{cat.name}</h2>
              </div>
              <ProductList
                layout={isTabletLayout ? 'tablet' : 'horizontal'}
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
              productTimeLimitedPromotions={productTimeLimitedPromotions}
              promotionTimezone={promotionTimezone}
              countdownContext={countdownContext}
              onProductClick={onProductClick}
            />
          </section>
        );
      })}
    </>
  );
}
