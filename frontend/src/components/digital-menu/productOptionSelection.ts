import type { OptionGroup } from '@/lib/api/types';

/** groupId → selected option item ids */
export type OptionSelections = Record<string, string[]>;

export function createEmptySelections(): OptionSelections {
  return {};
}

export function getGroupSelection(selections: OptionSelections, groupId: string): string[] {
  return selections[groupId] ?? [];
}

export function isItemSelected(
  selections: OptionSelections,
  groupId: string,
  itemId: string,
): boolean {
  return getGroupSelection(selections, groupId).includes(itemId);
}

export function toggleOptionSelection(
  group: OptionGroup,
  itemId: string,
  selections: OptionSelections,
): OptionSelections {
  const current = getGroupSelection(selections, group.id);

  if (group.selection === 'single') {
    if (current.includes(itemId) && !group.required) {
      return { ...selections, [group.id]: [] };
    }
    return { ...selections, [group.id]: [itemId] };
  }

  if (current.includes(itemId)) {
    return { ...selections, [group.id]: current.filter((id) => id !== itemId) };
  }

  const max = group.max_selections;
  if (max != null && current.length >= max) {
    return selections;
  }

  return { ...selections, [group.id]: [...current, itemId] };
}

export function isGroupRequirementMet(group: OptionGroup, selectedIds: string[]): boolean {
  const count = selectedIds.length;

  if (group.selection === 'single') {
    if (group.required) return count === 1;
    return count <= 1;
  }

  const minRequired = group.required ? Math.max(1, group.min_selections) : group.min_selections;
  if (count < minRequired) return false;

  const max = group.max_selections;
  if (max != null && count > max) return false;

  return true;
}

/** True when every required option group has a valid selection. */
export function canAddProductToCart(
  groups: OptionGroup[],
  selections: OptionSelections,
): boolean {
  const requiredGroups = groups.filter((group) => group.required);
  if (requiredGroups.length === 0) return true;

  return requiredGroups.every((group) =>
    isGroupRequirementMet(group, getGroupSelection(selections, group.id)),
  );
}

/** Sum of price_delta_cents for all selected items (per unit). */
export function selectedOptionsTotalCents(
  groups: OptionGroup[],
  selections: OptionSelections,
): number {
  let total = 0;

  for (const group of groups) {
    const selectedIds = new Set(getGroupSelection(selections, group.id));
    for (const item of group.items) {
      if (selectedIds.has(item.id)) {
        total += item.price_delta_cents;
      }
    }
  }

  return total;
}

export function computeLineTotal(
  baseUnitPrice: number,
  groups: OptionGroup[],
  selections: OptionSelections,
  quantity: number,
): number {
  const modifiers = selectedOptionsTotalCents(groups, selections) / 100;
  return (baseUnitPrice + modifiers) * quantity;
}
