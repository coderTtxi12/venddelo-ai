'use client';

import { useEffect, useRef, type RefObject } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { Product, Promotion } from '@/lib/api/types';
import { ProductList } from '@/components/digital-menu/menuProductUi';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import { productsParticipatingInPromotion } from '@/lib/promotions/promotionShortcuts';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { ProductImagePlaceholder } from '@/components/digital-menu/ProductImagePlaceholder';
import { PromotionCountdown } from '@/components/digital-menu/PromotionCountdown';
import { DIGITAL_MENU_PINNED_BAR_HEIGHT_PX } from '@/lib/digital-menu/layout';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import detailStyles from './DigitalMenuProductDetail.module.css';
import styles from './PromotionShortcutProductsView.module.css';

type PromotionShortcutProductsViewProps = {
  promotion: Promotion;
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  productTimeLimitedPromotions?: Map<string, Promotion>;
  timezone: string;
  countdownContext?: PromotionCountdownContext;
  heroCollapsed: boolean;
  onHeroCollapsedChange: (collapsed: boolean) => void;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onProductClick: (productId: string) => void;
  onBack: () => void;
  hideHeroBackButton?: boolean;
  isTabletLayout?: boolean;
};

export function PromotionShortcutProductsView({
  promotion,
  products,
  productDiscounts,
  productTimeLimitedPromotions,
  timezone,
  countdownContext,
  heroCollapsed,
  onHeroCollapsedChange,
  scrollRootRef,
  onProductClick,
  onBack,
  hideHeroBackButton = false,
  isTabletLayout = false,
}: PromotionShortcutProductsViewProps) {
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const imageUrl = storagePublicUrl(promotion.image_path);
  const participating = productsParticipatingInPromotion(products, promotion);

  useEffect(() => {
    onHeroCollapsedChange(false);
  }, [promotion.id, onHeroCollapsedChange]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = heroSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        onHeroCollapsedChange(!entry.isIntersecting);
      },
      {
        root,
        threshold: 0,
        rootMargin: `-${DIGITAL_MENU_PINNED_BAR_HEIGHT_PX}px 0px 0px 0px`,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [promotion.id, scrollRootRef, onHeroCollapsedChange]);

  return (
    <div className={`${detailStyles.detailRoot} ${isTabletLayout ? menuStyles.publicTablet : ''}`}>
      <section className={detailStyles.productHero} aria-label={promotion.name}>
        <div className={detailStyles.productHeroWrap}>
          {imageUrl ? (
            <img src={imageUrl} alt="" className={detailStyles.heroImage} />
          ) : (
            <ProductImagePlaceholder
              name={promotion.name}
              variant="hero"
              className={detailStyles.heroPlaceholder}
            />
          )}
          <div
            className={detailStyles.heroFloatBar}
            data-visible={hideHeroBackButton ? 'false' : heroCollapsed ? 'false' : 'true'}
            aria-hidden={hideHeroBackButton || heroCollapsed}
          >
            {!hideHeroBackButton ? (
              <button
                type="button"
                className={detailStyles.heroFloatBack}
                aria-label="Volver al menú"
                onClick={onBack}
              >
                <ArrowBackIcon fontSize="small" />
              </button>
            ) : null}
          </div>
        </div>
        <div ref={heroSentinelRef} className={detailStyles.heroSentinel} aria-hidden />
      </section>

      <div className={detailStyles.detailBody}>
        <p className={styles.eyebrow}>Promoción</p>
        <h1 className={detailStyles.productTitle}>{promotion.name}</h1>
        <p className={styles.meta}>
          {participating.length === 1
            ? '1 platillo participa'
            : `${participating.length} platillos participan`}
        </p>

        <PromotionCountdown
          promotion={promotion}
          timezone={timezone}
          countdownContext={countdownContext}
          variant="detail"
        />

        {participating.length === 0 ? (
          <p className={styles.empty}>No hay platillos disponibles en esta promoción.</p>
        ) : (
          <section className={styles.listSection} aria-label="Platillos de la promoción">
            <h2 className={styles.listHeading}>Platillos</h2>
            <div className={styles.productListWrap}>
              <ProductList
                layout={isTabletLayout ? 'tablet' : 'vertical'}
                products={participating}
                productDiscounts={productDiscounts}
                productTimeLimitedPromotions={productTimeLimitedPromotions}
                promotionTimezone={timezone}
                countdownContext={countdownContext}
                onProductClick={onProductClick}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
