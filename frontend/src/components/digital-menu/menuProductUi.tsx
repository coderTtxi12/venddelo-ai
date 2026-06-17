import type { CategoryDisplayLayout, Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import styles from '../pages/DigitalMenuPage.module.css';

export function ProductThumb({ product, className }: { product: Product; className?: string }) {
  const url = storagePublicUrl(product.image_path);
  if (url) {
    return <img src={url} alt={product.name} className={className} />;
  }
  return <div className={className} aria-hidden />;
}

export function ProductPrice({
  product,
  discount,
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
}) {
  const originalPrice = product.price_cents / 100;
  const hasPriceDiscount = discount != null && discount.amountOff > 0;

  if (!hasPriceDiscount && !discount?.badge) {
    return (
      <div className={styles.productPrice}>
        {formatMoney(originalPrice, product.currency)}
      </div>
    );
  }

  return (
    <div className={styles.productPriceRow}>
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
}: {
  product: Product;
  discount?: MenuProductDiscountInfo | null;
}) {
  return (
    <>
      <div className={styles.productName}>{product.name}</div>
      {product.description ? (
        <div className={styles.productDesc}>{product.description}</div>
      ) : null}
      <ProductPrice product={product} discount={discount} />
    </>
  );
}

export function ProductList({
  layout,
  products,
  productDiscounts,
  onProductClick,
}: {
  layout: CategoryDisplayLayout;
  products: Product[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  onProductClick: (productId: string) => void;
}) {
  if (products.length === 0) {
    return <div className={styles.emptyProducts}>Sin productos en esta categoría</div>;
  }

  if (layout === 'horizontal') {
    return (
      <div className={styles.productsHorizontal}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={`${styles.productCardH} ${styles.productTapTarget}`}
            onClick={() => onProductClick(product.id)}
            aria-label={`Ver ${product.name}`}
          >
            <ProductThumb product={product} className={styles.productThumb} />
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
            className={`${styles.productCardG} ${styles.productTapTarget}`}
            onClick={() => onProductClick(product.id)}
            aria-label={`Ver ${product.name}`}
          >
            <ProductThumb product={product} className={styles.productThumb} />
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
          className={`${styles.productRow} ${styles.productTapTarget}`}
          onClick={() => onProductClick(product.id)}
          aria-label={`Ver ${product.name}`}
        >
          <div className={styles.productRowBody}>
            <ProductCardContent
              product={product}
              discount={productDiscounts.get(product.id)}
            />
          </div>
          <ProductThumb product={product} className={styles.productThumb} />
        </button>
      ))}
    </div>
  );
}

export function productsForCategory(products: Product[], categoryId: string): Product[] {
  return products.filter((p) => p.is_active && p.category_ids.includes(categoryId));
}

export function sortCategories<T extends { sort_index: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name));
}
