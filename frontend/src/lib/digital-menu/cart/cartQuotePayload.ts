import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';
import type { CartQuoteInput } from '@/lib/api/public';
import type { PublicMenuCartLine } from './types';

export function selectionsToQuoteApi(selections: OptionSelections): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [groupId, itemIds] of Object.entries(selections)) {
    if (itemIds.length > 0) {
      out[groupId] = itemIds;
    }
  }
  return out;
}

export function cartLinesToQuoteInput(lines: PublicMenuCartLine[]): CartQuoteInput {
  return {
    items: lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      selected_options: selectionsToQuoteApi(line.selections),
    })),
  };
}
