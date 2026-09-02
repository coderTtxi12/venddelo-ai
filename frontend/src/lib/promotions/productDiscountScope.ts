import type { Product } from '@/lib/api/types';
import { normalizeCategorySelection } from '@/components/marketing/CategoryProductPicker';

export function resolveProductDiscountScope(
  categoryIds: string[],
  productIds: string[],
  products: Product[],
): {
  scope: 'product' | 'category';
  categoryIds: string[];
  productIds: string[];
} {
  if (categoryIds.length > 0) {
    return {
      scope: 'category',
      ...normalizeCategorySelection(categoryIds, productIds, products),
    };
  }
  return {
    scope: 'product',
    categoryIds: [],
    productIds,
  };
}

export function productDiscountMenuSummary(
  categoryIds: string[],
  productIds: string[],
): string | null {
  const parts: string[] = [];
  if (categoryIds.length > 0) {
    parts.push(`${categoryIds.length} categoría${categoryIds.length === 1 ? '' : 's'}`);
  }
  if (productIds.length > 0) {
    parts.push(`${productIds.length} producto${productIds.length === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
