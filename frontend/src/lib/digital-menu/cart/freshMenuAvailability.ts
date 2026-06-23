import { getPublicMenu } from '@/lib/api/public';
import type { Product } from '@/lib/api/types';
import {
  filterOrderableProducts,
  filterPublicMenuProducts,
} from '@/lib/digital-menu/orderableProducts';
import {
  validateCartAvailability,
  type CartAvailabilityIssue,
} from './validateCartAvailability';
import type { PublicMenuCartLine } from './types';

export type FreshMenuAvailabilityContext = {
  products: Product[];
  productsById: Map<string, Product>;
  validProductIds: Set<string>;
};

export async function fetchFreshMenuAvailabilityContext(
  subdomain: string,
): Promise<FreshMenuAvailabilityContext> {
  const menuData = await getPublicMenu(subdomain);
  const products = filterPublicMenuProducts(menuData.products);
  const validProductIds = new Set(filterOrderableProducts(products).map((product) => product.id));

  return {
    products,
    productsById: new Map(products.map((product) => [product.id, product])),
    validProductIds,
  };
}

export function validateCartAgainstMenu(
  lines: PublicMenuCartLine[],
  menu: FreshMenuAvailabilityContext,
): CartAvailabilityIssue[] {
  return validateCartAvailability(lines, menu.productsById, menu.validProductIds);
}

export function fallbackCartAvailabilityIssues(
  lines: PublicMenuCartLine[],
  validProductIds: ReadonlySet<string>,
): CartAvailabilityIssue[] {
  const fromIds = lines
    .filter((line) => !validProductIds.has(line.productId))
    .map((line) => ({
      kind: 'product' as const,
      lineId: line.id,
      productName: line.productName,
    }));

  if (fromIds.length > 0) return fromIds;

  return lines.map((line) => ({
    kind: 'product' as const,
    lineId: line.id,
    productName: line.productName,
  }));
}
