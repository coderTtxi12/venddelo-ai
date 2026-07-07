import type { Product } from '@/lib/api/types';

/** Products shown on the public menu (En menú + Inactivo, not Draft). */
export function filterPublicMenuProducts(products: Product[]): Product[] {
  return products.filter(isPublicMenuDisplayed);
}

/** Listed on the public menu (active or inactive — not draft). */
export function isPublicMenuListed(product: Product): boolean {
  return product.status !== 'draft';
}

/** Products shown on the public menu (En menú + Inactivo, not Draft). */
export function isPublicMenuDisplayed(product: Product): boolean {
  return product.status !== 'draft';
}

/** Products the public menu may sell and the cart quote API accepts. */
export function isOrderablePublicProduct(product: Product): boolean {
  return product.status === 'active';
}

export function filterOrderableProducts(products: Product[]): Product[] {
  return products.filter(isOrderablePublicProduct);
}
