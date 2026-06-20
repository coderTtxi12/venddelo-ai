import type { CategoryDisplayLayout, Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import styles from '../pages/DigitalMenuPage.module.css';

export const PRODUCT_UNAVAILABLE_LABEL = 'No disponible';

export function isProductAvailable(product: Product): boolean {
  return product.is_active;
}

export function productsForCategory(products: Product[], categoryId: string): Product[] {
  const inCategory = products.filter((p) => p.category_ids.includes(categoryId));
  const available = inCategory.filter((p) => p.is_active);
  const unavailable = inCategory.filter((p) => !p.is_active);
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
        <div className={styles.productThumbMedia} aria-hidden />
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
  className,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
  className?: string;
}) {
  const originalPrice = product.price_cents / 100;
  const hasPriceDiscount = discount != null && discount.amountOff > 0;

  if (!hasPriceDiscount && !discount?.badge) {
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
    </div>
  );
}

function ProductCardContent({
  product,
  discount,
  bodyClassName,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
  bodyClassName?: string;
}) {
  const content = (
    <>
      <div className={styles.productName}>{product.name}</div>
      {product.description ? (
        <div className={styles.productDesc}>{product.description}</div>
      ) : null}
      <ProductPrice product={product} discount={discount} />
    </>
  );

  if (bodyClassName) {
    return <div className={bodyClassName}>{content}</div>;
  }

  return content;
}

export type ProductListLayout = CategoryDisplayLayout | 'tablet';

function productCardClassName(baseClass: string, product: Product): string {
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
  onProductClick,
}: {
  layout: ProductListLayout;
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
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
