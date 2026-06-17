import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';

export type PublicMenuCartOptionSummary = {
  groupTitle: string;
  itemLabels: string[];
};

export type PublicMenuCartLine = {
  id: string;
  productId: string;
  productName: string;
  imagePath: string | null;
  currency: string;
  quantity: number;
  /** Base unit price in cents (after product-level discount). */
  unitPriceCents: number;
  /** Modifier total per unit in cents. */
  optionsTotalCents: number;
  selections: OptionSelections;
  optionSummary: PublicMenuCartOptionSummary[];
  addedAt: number;
};

export type PublicMenuCart = {
  lines: PublicMenuCartLine[];
  updatedAt: number;
};

export type AddToCartInput = Omit<PublicMenuCartLine, 'id' | 'addedAt'>;
