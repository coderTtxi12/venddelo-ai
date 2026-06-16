import type { Id, OptionGroupDraft, ProductDraft } from '@/services/db/supplierCatalogTypes';

export type CopyableOptionGroup = {
  key: string;
  sourceProductId: Id;
  sourceProductName: string;
  group: OptionGroupDraft;
};

export function listCopyableOptionGroups(
  products: ProductDraft[],
  currentProductId: Id | null,
  currentOptionGroups: OptionGroupDraft[],
): CopyableOptionGroup[] {
  const usedGroupIds = new Set(currentOptionGroups.map((group) => group.id));
  const entries: CopyableOptionGroup[] = [];

  for (const product of products) {
    for (const group of product.optionGroups) {
      if (!group.isActive) continue;

      const activeItems = group.items.filter((item) => item.isActive);
      if (activeItems.length === 0) continue;

      if (currentProductId === product.id && usedGroupIds.has(group.id)) {
        continue;
      }

      entries.push({
        key: `${product.id}:${group.id}`,
        sourceProductId: product.id,
        sourceProductName: product.name,
        group: {
          ...group,
          items: activeItems.map((item) => ({ ...item })),
        },
      });
    }
  }

  return entries.sort((a, b) => {
    const byTitle = a.group.title.localeCompare(b.group.title, undefined, { sensitivity: 'base' });
    if (byTitle !== 0) return byTitle;
    return a.sourceProductName.localeCompare(b.sourceProductName, undefined, { sensitivity: 'base' });
  });
}

export function cloneOptionGroupForProduct(
  source: OptionGroupDraft,
  newId: (prefix?: string) => string,
): OptionGroupDraft {
  return {
    id: newId('og'),
    title: source.title,
    required: source.required,
    selection: source.selection,
    maxSelections: source.selection === 'single' ? 1 : source.maxSelections,
    isActive: true,
    items: source.items
      .filter((item) => item.isActive)
      .map((item) => ({
        id: newId('oi'),
        label: item.label,
        priceDeltaUsd: item.priceDeltaUsd,
        isActive: true,
      })),
  };
}
