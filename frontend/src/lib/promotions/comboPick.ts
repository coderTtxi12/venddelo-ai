/** Pool size implied by a name like "2 Hamburguesas x 100" when no quantity was saved. */
export function inferredComboPickQuantity(name: string, productCount: number): number | null {
  const match = /^\s*(\d+)\b/.exec(name);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 2 || count >= productCount) return null;
  return count;
}

export function activeComboPickQuantity(input: {
  comboPickQuantity: number | null;
  kind: string;
  name: string;
  productCount: number;
}): number | null {
  if (input.comboPickQuantity === 0) return null;
  if (input.comboPickQuantity != null && input.comboPickQuantity >= 2) {
    return input.comboPickQuantity;
  }
  if (input.kind !== 'combo_price') return null;
  return inferredComboPickQuantity(input.name, input.productCount);
}
