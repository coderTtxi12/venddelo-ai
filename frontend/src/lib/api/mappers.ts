import type { Category, OptionGroup, Product } from './types';
import type {
  ApprovalStatus,
  CategoryDraft,
  OptionGroupDraft,
  ProductDraft,
} from '@/services/db/supplierCatalogTypes';

function imageFromPath(path: string | null) {
  if (!path) return null;
  return { previewUrl: path };
}

function mapOptionGroup(group: OptionGroup): OptionGroupDraft {
  return {
    id: group.id,
    title: group.title,
    required: group.required,
    selection: group.selection,
    isActive: group.is_active,
    items: group.items.map((item) => ({
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

export function mapProductToDraft(product: Product): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    price: { amount: product.price_cents / 100, currency: 'USD' },
    discountUsd: 0,
    image: imageFromPath(product.image_path),
    categoryIds: product.category_ids,
    optionGroups: product.option_groups.map(mapOptionGroup),
    approvalStatus: product.approval_status as ApprovalStatus,
    isPublished: product.is_published,
    isActive: product.is_active,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}
