import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';
import type { PublicMenuCartLine } from './types';

export function lineTotalCents(line: PublicMenuCartLine): number {
  return (line.unitPriceCents + line.optionsTotalCents) * line.quantity;
}

export function cartSubtotalCents(lines: PublicMenuCartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function cartItemCount(lines: PublicMenuCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function normalizeSelectionIds(ids: string[]): string {
  return [...ids].sort().join('\0');
}

export function selectionsEqual(a: OptionSelections, b: OptionSelections): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (normalizeSelectionIds(a[key] ?? []) !== normalizeSelectionIds(b[key] ?? [])) {
      return false;
    }
  }
  return true;
}

export function normalizeCartNotes(notes: string | undefined): string {
  return (notes ?? '').trim();
}

export function findMatchingLineIndex(
  lines: PublicMenuCartLine[],
  productId: string,
  selections: OptionSelections,
  notes?: string,
): number {
  const normalizedNotes = normalizeCartNotes(notes);
  return lines.findIndex(
    (line) =>
      line.productId === productId &&
      selectionsEqual(line.selections, selections) &&
      normalizeCartNotes(line.notes) === normalizedNotes,
  );
}
