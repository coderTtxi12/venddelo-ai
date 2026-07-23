import type { Category, OptionGroup, Product } from './types';
import type { CategoryDraft, OptionGroupDraft, ProductDraft } from '@/services/db/supplierCatalogTypes';
import { storagePublicUrl } from '@/lib/storage/publicUrl';

function imageFromPath(path: string | null | undefined, publicUrl?: string | null) {
  const previewUrl = publicUrl ?? storagePublicUrl(path);
  if (!previewUrl) return null;
  return { previewUrl };
}

export function mapOptionGroupToDraft(group: OptionGroup): OptionGroupDraft {
  return {
    id: group.id,
    title: group.title,
    required: group.required,
    selection: group.selection,
    maxSelections: group.selection === 'single' ? 1 : group.max_selections,
    isActive: group.is_active,
    items: [...group.items]
      .sort((a, b) => a.sort_index - b.sort_index)
      .map((item) => ({
        id: item.id,
        label: item.label,
        priceDeltaUsd: item.price_delta_cents / 100,
        isActive: item.is_active,
      })),
  };
}

export function mapCategoryToDraft(category: Category): CategoryDraft {
  return {
    id: category.id,
    name: category.name,
    description: category.description ?? '',
    image: imageFromPath(category.image_path),
    isActive: category.is_active,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  };
}

export function mapProductToDraft(product: Product, discountUsd = 0): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    price: { amount: product.price_cents / 100, currency: product.currency },
    discountUsd,
    image: imageFromPath(product.image_path, product.image_url),
    categoryIds: product.category_ids,
    optionGroups: [...product.option_groups]
      .sort((a, b) => a.sort_index - b.sort_index)
      .map(mapOptionGroupToDraft),
    status: product.status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}
