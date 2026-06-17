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
