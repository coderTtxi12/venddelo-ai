import type { Product } from '@/lib/api/types';
import {
  isLiveMenuVisible,
  isPublicMenuDisplayed,
} from '@/lib/menu/productVisibility';

export {
  isLiveMenuVisible,
  isPublicMenuDisplayed,
  isPublicMenuListed,
} from '@/lib/menu/productVisibility';

/** Products shown on the public menu (En menú + Inactivo, not Draft). */
export function filterPublicMenuProducts(products: Product[]): Product[] {
  return products.filter(isPublicMenuDisplayed);
}

/** Products the public menu may sell and the cart quote API accepts. */
export function isOrderablePublicProduct(product: Product): boolean {
  return isLiveMenuVisible(product);
}

export function filterOrderableProducts(products: Product[]): Product[] {
  return products.filter(isOrderablePublicProduct);
}
