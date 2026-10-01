import type { Product } from '@/lib/api/types';
import { isProductMenuScheduleActive } from '@/lib/menu/productMenuSchedule';

const DEFAULT_MENU_TIMEZONE = 'America/Mexico_City';

/** Products shown on the public menu (En menú + Inactivo, not Draft). */
export function filterPublicMenuProducts(
  products: Product[],
  now: Date = new Date(),
  timezone: string = DEFAULT_MENU_TIMEZONE,
): Product[] {
  return products.filter((product) => isPublicMenuDisplayedNow(product, now, timezone));
}

/** Listed on the public menu (active or inactive — not draft). */
export function isPublicMenuListed(product: Product): boolean {
  return product.status !== 'draft';
}

/** Products shown on the public menu (En menú + Inactivo, not Draft). */
export function isPublicMenuDisplayed(product: Product): boolean {
  return product.status !== 'draft';
}

/** Listed on the public menu and within the product's visibility schedule. */
export function isPublicMenuDisplayedNow(
  product: Product,
  now: Date = new Date(),
  timezone: string = DEFAULT_MENU_TIMEZONE,
): boolean {
  if (!isPublicMenuDisplayed(product)) return false;
  return isProductMenuScheduleActive(product, now, timezone);
}

/** Products the public menu may sell and the cart quote API accepts. */
export function isOrderablePublicProduct(
  product: Product,
  now: Date = new Date(),
  timezone: string = DEFAULT_MENU_TIMEZONE,
): boolean {
  return product.status === 'active' && isProductMenuScheduleActive(product, now, timezone);
}

export function filterOrderableProducts(
  products: Product[],
  now: Date = new Date(),
  timezone: string = DEFAULT_MENU_TIMEZONE,
): Product[] {
  return products.filter((product) => isOrderablePublicProduct(product, now, timezone));
}
