import { arrayMove } from '@/lib/arrayMove';
import type { OptionGroup } from '@/lib/api/types';

export function reorderActiveOptionGroups(
  groups: OptionGroup[],
  from: number,
  to: number,
): OptionGroup[] {
  const active = groups.filter((group) => group.is_active);
  const inactive = groups.filter((group) => !group.is_active);
  const reorderedActive = arrayMove(active, from, to).map((group, index) => ({
    ...group,
    sort_index: index,
  }));
  const inactiveStart = reorderedActive.length;
  const reorderedInactive = inactive.map((group, index) => ({
    ...group,
    sort_index: inactiveStart + index,
  }));
  return [...reorderedActive, ...reorderedInactive];
}

export function reorderActiveOptionItems(
  group: OptionGroup,
  from: number,
  to: number,
): OptionGroup {
  const active = group.items.filter((item) => item.is_active);
  const inactive = group.items.filter((item) => !item.is_active);
  const reorderedActive = arrayMove(active, from, to).map((item, index) => ({
    ...item,
    sort_index: index,
  }));
  const inactiveStart = reorderedActive.length;
  const reorderedInactive = inactive.map((item, index) => ({
    ...item,
    sort_index: inactiveStart + index,
  }));
  return { ...group, items: [...reorderedActive, ...reorderedInactive] };
}

export function replaceProductOptionGroup(
  groups: OptionGroup[],
  groupId: string,
  nextGroup: OptionGroup,
): OptionGroup[] {
  return groups.map((group) => (group.id === groupId ? nextGroup : group));
}
