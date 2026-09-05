import { isOrderablePublicProduct } from '@/lib/digital-menu/orderableProducts';
import type { Product } from '@/lib/api/types';
import type { PublicMenuCartLine } from './types';

export type CartAvailabilityIssue =
  | {
      kind: 'product';
      lineId: string;
      productName: string;
    }
  | {
      kind: 'complement';
      lineId: string;
      productName: string;
      groupTitle: string;
      itemLabel: string;
    }
  | {
      kind: 'stock';
      lineId: string;
      productName: string;
      available: number;
      requested: number;
    };

function findOptionItem(
  product: Product,
  itemId: string,
): { groupTitle: string; itemLabel: string; isAvailable: boolean } | null {
  for (const group of product.option_groups) {
    for (const item of group.items) {
      if (item.id !== itemId) continue;
      return {
        groupTitle: group.title,
        itemLabel: item.label,
        isAvailable: group.is_active && item.is_active,
      };
    }
  }
  return null;
}

function groupTitleForId(product: Product, groupId: string): string {
  return product.option_groups.find((group) => group.id === groupId)?.title ?? 'opciones';
}

export function groupCartAvailabilityIssuesByLine(
  issues: CartAvailabilityIssue[],
): Map<string, CartAvailabilityIssue[]> {
  const byLine = new Map<string, CartAvailabilityIssue[]>();
  for (const issue of issues) {
    const lineIssues = byLine.get(issue.lineId) ?? [];
    lineIssues.push(issue);
    byLine.set(issue.lineId, lineIssues);
  }
  return byLine;
}

/**
 * Stock shortfalls when live inventory is on (public menu exposes inventory_qty)
 * and the product tracks qty. Aggregates quantity across lines of the same product.
 */
export function validateCartStock(
  lines: PublicMenuCartLine[],
  productsById: ReadonlyMap<string, Product>,
  skipLineIds?: ReadonlySet<string>,
): CartAvailabilityIssue[] {
  const requestedByProduct = new Map<
    string,
    { productName: string; total: number; lineIds: string[] }
  >();

  for (const line of lines) {
    if (skipLineIds?.has(line.id)) continue;
    const product = productsById.get(line.productId);
    if (!product || product.inventory_qty == null) continue;

    const current = requestedByProduct.get(line.productId) ?? {
      productName: product.name || line.productName,
      total: 0,
      lineIds: [],
    };
    current.total += Math.max(0, line.quantity);
    current.lineIds.push(line.id);
    current.productName = product.name || line.productName;
    requestedByProduct.set(line.productId, current);
  }

  const issues: CartAvailabilityIssue[] = [];
  for (const [productId, entry] of requestedByProduct) {
    const product = productsById.get(productId);
    if (!product || product.inventory_qty == null) continue;
    if (entry.total <= product.inventory_qty) continue;

    for (const lineId of entry.lineIds) {
      issues.push({
        kind: 'stock',
        lineId,
        productName: entry.productName,
        available: product.inventory_qty,
        requested: entry.total,
      });
    }
  }

  return issues;
}

export function validateCartAvailability(
  lines: PublicMenuCartLine[],
  productsById: ReadonlyMap<string, Product>,
  validProductIds?: ReadonlySet<string>,
): CartAvailabilityIssue[] {
  const issues: CartAvailabilityIssue[] = [];
  const unavailableLineIds = new Set<string>();

  for (const line of lines) {
    const product = productsById.get(line.productId);
    const productNotOrderable =
      !product ||
      !isOrderablePublicProduct(product) ||
      (validProductIds != null && !validProductIds.has(line.productId));

    if (productNotOrderable) {
      unavailableLineIds.add(line.id);
      issues.push({
        kind: 'product',
        lineId: line.id,
        productName: line.productName,
      });
      continue;
    }

    for (const [groupId, selectedIds] of Object.entries(line.selections)) {
      for (const itemId of selectedIds) {
        const match = findOptionItem(product, itemId);
        if (match == null) {
          issues.push({
            kind: 'complement',
            lineId: line.id,
            productName: line.productName,
            groupTitle: groupTitleForId(product, groupId),
            itemLabel: 'Una opción',
          });
          continue;
        }

        if (!match.isAvailable) {
          issues.push({
            kind: 'complement',
            lineId: line.id,
            productName: line.productName,
            groupTitle: match.groupTitle,
            itemLabel: match.itemLabel,
          });
        }
      }
    }
  }

  issues.push(...validateCartStock(lines, productsById, unavailableLineIds));
  return issues;
}

export function cartAvailabilityIssueMessage(
  issue: CartAvailabilityIssue,
  context: 'line' | 'summary' = 'summary',
): string {
  if (issue.kind === 'stock') {
    if (issue.available <= 0) {
      return context === 'line'
        ? 'Sin stock · Baja la cantidad o quítalo'
        : `Sin stock de «${issue.productName}»`;
    }
    return context === 'line'
      ? `Solo quedan ${issue.available} · Baja la cantidad`
      : `Solo quedan ${issue.available} de «${issue.productName}»`;
  }

  if (issue.kind === 'product') {
    return context === 'line'
      ? 'Producto agotado · Quítalo'
      : `Producto agotado: quita «${issue.productName}»`;
  }

  if (context === 'line') {
    return `«${issue.itemLabel}» agotada · Cambia opciones`;
  }

  return `Opción agotada: cambia «${issue.itemLabel}» en «${issue.productName}»`;
}

export function formatCartAvailabilityMessages(
  issues: CartAvailabilityIssue[],
  context: 'line' | 'summary' = 'summary',
): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    const message = cartAvailabilityIssueMessage(issue, context);
    if (context === 'summary') {
      if (seen.has(message)) continue;
      seen.add(message);
    }
    messages.push(message);
  }

  return messages;
}
