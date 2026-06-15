import { create } from "zustand";
import type { Product } from "@/lib/api/types";

export type CartLine = {
  product: Product;
  quantity: number;
  selectedOptions: Record<string, string[]>;
  lineTotalCents: number;
};

type CartState = {
  lines: CartLine[];
  addLine: (line: CartLine) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  totalCents: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addLine: (line) =>
    set((state) => ({
      lines: [...state.lines.filter((l) => l.product.id !== line.product.id), line],
    })),
  removeLine: (productId) =>
    set((state) => ({ lines: state.lines.filter((l) => l.product.id !== productId) })),
  clear: () => set({ lines: [] }),
  totalCents: () => get().lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
}));

export function computeLineTotal(
  product: Product,
  quantity: number,
  selected: Record<string, string[]>,
): number {
  let delta = 0;
  for (const group of product.option_groups) {
    const picks = selected[group.id] ?? [];
    for (const itemId of picks) {
      const item = group.items.find((i) => i.id === itemId);
      if (item) delta += item.price_delta_cents;
    }
  }
  return (product.price_cents + delta) * quantity;
}
