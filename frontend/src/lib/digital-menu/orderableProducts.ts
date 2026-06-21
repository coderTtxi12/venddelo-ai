import type { Product } from '@/lib/api/types';
import { isLiveMenuVisible } from '@/lib/menu/productVisibility';

export { isLiveMenuVisible } from '@/lib/menu/productVisibility';

/** Products the public menu may sell and the cart quote API accepts. */
export function isOrderablePublicProduct(product: Product): boolean {
  return isLiveMenuVisible(product);
}

export function filterOrderableProducts(products: Product[]): Product[] {
  return products.filter(isOrderablePublicProduct);
}
