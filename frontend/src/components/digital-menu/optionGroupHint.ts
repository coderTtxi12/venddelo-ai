import type { OptionGroup } from '@/lib/api/types';

/** Customer-facing hint for an option group (preview / mobile menu). */
export function optionGroupSelectionHint(group: OptionGroup): string {
  if (group.selection === 'single') {
    return group.required ? 'Elige 1 · Obligatorio' : 'Elige 1';
  }

  const min = group.min_selections;
  const max = group.max_selections;

  if (group.required && min > 0) {
    if (max != null && max > min) return `Elige ${min}–${max} · Obligatorio`;
    if (max != null) return `Elige hasta ${max} · Obligatorio`;
    return `Mínimo ${min} · Obligatorio`;
  }

  if (max != null) return `Hasta ${max} opciones`;
  return 'Opcional';
}

export const OPTION_ITEM_SOLD_OUT_LABEL = 'Agotado';

function sortOptionItemsForDisplay(items: OptionGroup['items']): OptionGroup['items'] {
  const active = items.filter((item) => item.is_active);
  const inactive = items.filter((item) => !item.is_active);
  const bySortIndex = (a: OptionGroup['items'][number], b: OptionGroup['items'][number]) =>
    a.sort_index - b.sort_index;
  return [...active.sort(bySortIndex), ...inactive.sort(bySortIndex)];
}

/** Active groups and items only — cart, pricing, and validation. */
export function activeOptionGroups(product: { option_groups: OptionGroup[] }): OptionGroup[] {
  return [...product.option_groups]
    .filter((group) => group.is_active)
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((group) => ({
      ...group,
      items: [...group.items]
        .filter((item) => item.is_active)
        .sort((a, b) => a.sort_index - b.sort_index),
    }))
    .filter((group) => group.items.length > 0);
}

/** Active groups with all items (including sold-out) for the live product detail UI. */
export function displayOptionGroups(product: { option_groups: OptionGroup[] }): OptionGroup[] {
  return [...product.option_groups]
    .filter((group) => group.is_active)
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((group) => ({
      ...group,
      items: sortOptionItemsForDisplay(group.items),
    }))
    .filter((group) => group.items.length > 0);
}
