import type { Product } from '@/lib/api/types';
import styles from '../pages/DigitalMenuPage.module.css';

export const PRODUCT_LOW_STOCK_LABEL = '¡Date prisa! Quedan pocas';

export function shouldShowProductLowStock(product: Product): boolean {
  return product.status === 'active' && product.show_low_stock === true;
}

export function ProductLowStockBadge({ className }: { className?: string }) {
  return (
    <span className={[styles.productLowStockBadge, className].filter(Boolean).join(' ')}>
      {PRODUCT_LOW_STOCK_LABEL}
    </span>
  );
}
