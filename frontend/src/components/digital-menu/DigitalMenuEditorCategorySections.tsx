'use client';

import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewCarouselOutlinedIcon from '@mui/icons-material/ViewCarouselOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import type { MutableRefObject } from 'react';
import type { Category, CategoryDisplayLayout, Product, Promotion } from '@/lib/api/types';
import { ProductList, productsForCategory } from '@/components/digital-menu/menuProductUi';
import { PromotionShortcutBanners } from '@/components/digital-menu/PromotionShortcutBanners';
import {
  SortableProductList,
  type ProductDragTarget,
} from '@/components/digital-menu/SortableProductList';
import {
  getDigitalMenuSpecialCategoryKind,
  productsForLimitedTimeCategory,
} from '@/lib/digital-menu/specialCategories';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';

type DigitalMenuEditorCategorySectionsProps = {
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
  productDragTarget: ProductDragTarget;
  productDropTarget: ProductDragTarget;
  onProductDragTargetChange: (target: ProductDragTarget) => void;
  onProductDropTargetChange: (target: ProductDragTarget) => void;
  onProductDrop: (categoryId: string, targetProductId: string) => void;
  onProductClick: (productId: string) => void;
  onLayoutChange: (categoryId: string, layout: CategoryDisplayLayout) => void;
};

export function DigitalMenuEditorCategorySections({
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
  productDragTarget,
  productDropTarget,
  onProductDragTargetChange,
  onProductDropTargetChange,
  onProductDrop,
  onProductClick,
  onLayoutChange,
}: DigitalMenuEditorCategorySectionsProps) {
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
            ref={(el) => {
              sectionRefs.current[cat.id] = el;
            }}
            className={menuStyles.section}
          >
            <div className={menuStyles.sectionHeader}>
              <h2 className={menuStyles.sectionTitle}>{cat.name}</h2>
              {!isTabletLayout ? (
                <div className={menuStyles.layoutPicker} role="group" aria-label="Vista de productos">
                  <button
                    type="button"
                    className={`${menuStyles.layoutBtn} ${
                      layout === 'vertical' ? menuStyles.layoutBtnActive : ''
                    }`}
                    title="Lista vertical"
                    onClick={() => onLayoutChange(cat.id, 'vertical')}
                  >
                    <ViewListOutlinedIcon sx={{ fontSize: 18 }} />
                  </button>
                  <button
                    type="button"
                    className={`${menuStyles.layoutBtn} ${
                      layout === 'horizontal' ? menuStyles.layoutBtnActive : ''
                    }`}
                    title="Lista horizontal"
                    onClick={() => onLayoutChange(cat.id, 'horizontal')}
                  >
                    <ViewCarouselOutlinedIcon sx={{ fontSize: 18 }} />
                  </button>
                  <button
                    type="button"
                    className={`${menuStyles.layoutBtn} ${
                      layout === 'grid' ? menuStyles.layoutBtnActive : ''
                    }`}
                    title="Cuadrícula"
                    onClick={() => onLayoutChange(cat.id, 'grid')}
                  >
                    <GridViewOutlinedIcon sx={{ fontSize: 18 }} />
                  </button>
                </div>
              ) : null}
            </div>
            <SortableProductList
              categoryId={cat.id}
              layout={isTabletLayout ? 'tablet' : layout}
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
      })}
    </>
  );
}
