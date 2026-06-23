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

export function validateCartAvailability(
  lines: PublicMenuCartLine[],
  productsById: ReadonlyMap<string, Product>,
  validProductIds?: ReadonlySet<string>,
): CartAvailabilityIssue[] {
  const issues: CartAvailabilityIssue[] = [];

  for (const line of lines) {
    const product = productsById.get(line.productId);
    const productNotOrderable =
      !product ||
      !isOrderablePublicProduct(product) ||
      (validProductIds != null && !validProductIds.has(line.productId));

    if (productNotOrderable) {
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

  return issues;
}

export function cartAvailabilityIssueMessage(
  issue: CartAvailabilityIssue,
  context: 'line' | 'summary' = 'summary',
): string {
  if (issue.kind === 'product') {
    return context === 'line'
      ? 'Ya no disponible · Quítalo'
      : `Quita «${issue.productName}»`;
  }

  if (context === 'line') {
    return `«${issue.itemLabel}» no disponible · Cambia opciones`;
  }

  return `Cambia «${issue.itemLabel}» en «${issue.productName}»`;
}

export function formatCartAvailabilityMessages(
  issues: CartAvailabilityIssue[],
  context: 'line' | 'summary' = 'summary',
): string[] {
  return issues.map((issue) => cartAvailabilityIssueMessage(issue, context));
}
