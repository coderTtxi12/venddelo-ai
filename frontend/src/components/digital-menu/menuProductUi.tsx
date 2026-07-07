import type { CategoryDisplayLayout, Product, Promotion } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { ProductImagePlaceholder } from '@/components/digital-menu/ProductImagePlaceholder';
import { PromotionCountdown } from '@/components/digital-menu/PromotionCountdown';
import styles from '../pages/DigitalMenuPage.module.css';

export const PRODUCT_UNAVAILABLE_LABEL = 'No disponible';

export function isProductAvailable(product: Product): boolean {
  return product.status === 'active';
}

export function productsForCategory(products: Product[], categoryId: string): Product[] {
  const inCategory = products.filter((p) => p.category_ids.includes(categoryId));
  const sortByCategoryIndex = (list: Product[]) =>
    [...list].sort((a, b) => {
      const sa = a.category_sort_indices?.[categoryId] ?? Number.MAX_SAFE_INTEGER;
      const sb = b.category_sort_indices?.[categoryId] ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  const available = sortByCategoryIndex(inCategory.filter((p) => p.status === 'active'));
  const unavailable = sortByCategoryIndex(inCategory.filter((p) => p.status !== 'active'));
  return [...available, ...unavailable];
}

export function ProductListThumb({ product, className }: { product: Product; className?: string }) {
  const unavailable = !isProductAvailable(product);
  const url = storagePublicUrl(product.image_path);
  const wrapClass = [
    styles.productThumb,
    className,
    unavailable ? styles.productThumbUnavailable : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapClass}>
      {url ? (
        <img src={url} alt="" className={styles.productThumbMedia} />
      ) : (
        <ProductImagePlaceholder name={product.name} className={styles.productThumbMedia} />
      )}
      {unavailable ? (
        <span className={styles.productThumbUnavailableOverlay} aria-hidden>
          <span className={styles.productThumbUnavailableLabel}>{PRODUCT_UNAVAILABLE_LABEL}</span>
        </span>
      ) : null}
    </div>
  );
}

export function ProductPrice({
  product,
  discount,
  timeLimitedPromotion,
  promotionTimezone,
  countdownContext,
  className,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
  timeLimitedPromotion?: Promotion | null;
  promotionTimezone?: string;
  countdownContext?: PromotionCountdownContext;
  className?: string;
}) {
  const originalPrice = product.price_cents / 100;
  const hasPriceDiscount = discount != null && discount.amountOff > 0;
  const showCountdown = timeLimitedPromotion != null && promotionTimezone != null;

  if (!hasPriceDiscount && !discount?.badge && !showCountdown) {
    return (
      <div className={`${styles.productPrice} ${className ?? ''}`.trim()}>
        {formatMoney(originalPrice, product.currency)}
      </div>
    );
  }

  return (
    <div className={`${styles.productPriceRow} ${className ?? ''}`.trim()}>
      {hasPriceDiscount ? (
        <>
          <span className={styles.productPriceOriginal}>
            {formatMoney(originalPrice, product.currency)}
          </span>
          <span className={styles.productPriceSale}>
            {formatMoney(discount.finalPrice, product.currency)}
          </span>
        </>
      ) : (
        <span className={styles.productPrice}>
          {formatMoney(originalPrice, product.currency)}
        </span>
      )}
      {discount?.badge ? (
        <span className={styles.productDiscountBadge}>{discount.badge}</span>
      ) : null}
      {showCountdown ? (
        <PromotionCountdown
          promotion={timeLimitedPromotion}
          timezone={promotionTimezone}
          countdownContext={countdownContext}
          variant="compact"
        />
      ) : null}
    </div>
  );
}

export function ProductCardContent({
  product,
  discount,
  timeLimitedPromotion,
  promotionTimezone,
  countdownContext,
  bodyClassName,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
  timeLimitedPromotion?: Promotion | null;
  promotionTimezone?: string;
  countdownContext?: PromotionCountdownContext;
  bodyClassName?: string;
}) {
  const content = (
    <>
      <div className={styles.productName}>{product.name}</div>
      {product.description ? (
        <div className={styles.productDesc}>{product.description}</div>
      ) : null}
      <ProductPrice
        product={product}
        discount={discount}
        timeLimitedPromotion={timeLimitedPromotion}
        promotionTimezone={promotionTimezone}
        countdownContext={countdownContext}
      />
    </>
  );

  if (bodyClassName) {
    return <div className={bodyClassName}>{content}</div>;
  }

  return content;
}

export type ProductListLayout = CategoryDisplayLayout | 'tablet' | 'desktop';

export function productCardClassName(baseClass: string, product: Product): string {
  const classes = [baseClass, styles.productTapTarget];
  if (!isProductAvailable(product)) {
    classes.push(styles.productUnavailable);
  }
  return classes.join(' ');
}

export function productAriaLabel(product: Product): string {
  if (!isProductAvailable(product)) {
    return `${product.name}, ${PRODUCT_UNAVAILABLE_LABEL.toLowerCase()}`;
  }
  return `Ver ${product.name}`;
}

export function ProductList({
  layout,
  products,
  productDiscounts,
  productTimeLimitedPromotions,
  promotionTimezone,
  countdownContext,
  onProductClick,
}: {
  layout: ProductListLayout;
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  productTimeLimitedPromotions?: Map<string, Promotion>;
  promotionTimezone?: string;
  countdownContext?: PromotionCountdownContext;
  onProductClick: (productId: string) => void;
}) {
  if (products.length === 0) {
    return <div className={styles.emptyProducts}>Sin productos en esta categoría</div>;
  }

  if (layout === 'tablet') {
    return (
      <div className={styles.productsTabletGrid}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={productCardClassName(styles.productCardTablet, product)}
            onClick={() => onProductClick(product.id)}
            aria-label={productAriaLabel(product)}
          >
            <ProductListThumb product={product} className={styles.productThumb} />
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
              timeLimitedPromotion={productTimeLimitedPromotions?.get(product.id)}
              promotionTimezone={promotionTimezone}
              countdownContext={countdownContext}
              bodyClassName={styles.productCardTabletBody}
            />
          </button>
        ))}
      </div>
    );
  }

  if (layout === 'horizontal') {
    return (
      <div className={styles.productsHorizontal}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={productCardClassName(styles.productCardH, product)}
            onClick={() => onProductClick(product.id)}
            aria-label={productAriaLabel(product)}
          >
            <ProductListThumb product={product} className={styles.productThumb} />
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
              timeLimitedPromotion={productTimeLimitedPromotions?.get(product.id)}
              promotionTimezone={promotionTimezone}
              countdownContext={countdownContext}
            />
          </button>
        ))}
      </div>
    );
  }

  if (layout === 'grid') {
    return (
      <div className={styles.productsGrid}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={productCardClassName(styles.productCardG, product)}
            onClick={() => onProductClick(product.id)}
            aria-label={productAriaLabel(product)}
          >
            <ProductListThumb product={product} className={styles.productThumb} />
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
              timeLimitedPromotion={productTimeLimitedPromotions?.get(product.id)}
              promotionTimezone={promotionTimezone}
              countdownContext={countdownContext}
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.productsVertical}>
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          className={productCardClassName(styles.productRow, product)}
          onClick={() => onProductClick(product.id)}
          aria-label={productAriaLabel(product)}
        >
          <div className={styles.productRowBody}>
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
              timeLimitedPromotion={productTimeLimitedPromotions?.get(product.id)}
              promotionTimezone={promotionTimezone}
              countdownContext={countdownContext}
            />
          </div>
          <ProductListThumb product={product} className={styles.productThumb} />
        </button>
      ))}
    </div>
  );
}

export function sortCategories<T extends { sort_index: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name));
}
