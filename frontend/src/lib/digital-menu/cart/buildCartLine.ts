import { activeOptionGroups } from '@/components/digital-menu/optionGroupHint';
import {
  getGroupSelection,
  getSelectedOptionLabels,
  selectedOptionsTotalCents,
  type OptionSelections,
} from '@/components/digital-menu/productOptionSelection';
import type { Product } from '@/lib/api/types';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { AddToCartInput } from './types';

export function buildAddToCartInput(
  product: Product,
  discount: MenuProductDiscountInfo | null | undefined,
  quantity: number,
  selections: OptionSelections,
): AddToCartInput {
  const groups = activeOptionGroups(product);
  const unitPrice =
    discount != null && discount.amountOff > 0
      ? discount.finalPrice
      : product.price_cents / 100;

  return {
    productId: product.id,
    productName: product.name,
    imagePath: product.image_path,
    currency: product.currency,
    quantity,
    unitPriceCents: Math.round(unitPrice * 100),
    optionsTotalCents: selectedOptionsTotalCents(groups, selections),
    selections,
    optionSummary: groups
      .map((group) => {
        const labels = getSelectedOptionLabels(group, getGroupSelection(selections, group.id));
        if (labels.length === 0) return null;
        return { groupTitle: group.title, itemLabels: labels };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null),
  };
}
