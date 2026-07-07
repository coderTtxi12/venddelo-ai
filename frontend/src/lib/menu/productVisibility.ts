import type { ProductStatus } from '@/lib/api/types';
import type { ProductDraft } from '@/services/db/supplierCatalogTypes';

export type ProductVisibilityState = 'live' | 'hidden' | 'inactive';

type VisibilityFields = {
  status?: ProductStatus;
};

export const PRODUCT_VISIBILITY_OPTIONS: {
  value: ProductVisibilityState;
  label: string;
  help: string;
}[] = [
  {
    value: 'live',
    label: 'En menú',
    help: 'Visible en el menú público y se puede vender.',
  },
  {
    value: 'hidden',
    label: 'Draft',
    help: 'Solo visible en el panel; no aparece en el menú público.',
  },
  {
    value: 'inactive',
    label: 'Inactivo',
    help: 'Visible en el menú, pero no se puede vender.',
  },
];

export function isPublicMenuListed(product: VisibilityFields): boolean {
  return product.status !== 'draft';
}

export function getProductVisibilityState(product: VisibilityFields): ProductVisibilityState {
  switch (product.status) {
    case 'active':
      return 'live';
    case 'inactive':
      return 'inactive';
    case 'draft':
    default:
      return 'hidden';
  }
}

/** Listed on the public menu (En menú or Inactivo — not Draft). */
export function isPublicMenuDisplayed(product: VisibilityFields): boolean {
  return isPublicMenuListed(product);
}

/** Product is visible in the public menu and can be ordered. */
export function isLiveMenuVisible(product: VisibilityFields): boolean {
  return product.status === 'active';
}

export function productVisibilityMeta(product: VisibilityFields): {
  state: ProductVisibilityState;
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'danger';
  help: string;
} {
  const state = getProductVisibilityState(product);
  const option = PRODUCT_VISIBILITY_OPTIONS.find((entry) => entry.value === state)!;
  return {
    state,
    label: option.label,
    tone: state === 'live' ? 'success' : state === 'hidden' ? 'info' : 'neutral',
    help: option.help,
  };
}

export function visibilityUpdateForState(state: ProductVisibilityState): {
  status: ProductStatus;
} {
  switch (state) {
    case 'live':
      return { status: 'active' };
    case 'hidden':
      return { status: 'draft' };
    case 'inactive':
      return { status: 'inactive' };
  }
}

export function applyVisibilityStateToDraft(
  product: ProductDraft,
  state: ProductVisibilityState,
): ProductDraft {
  const patch = visibilityUpdateForState(state);
  return {
    ...product,
    status: patch.status,
    updatedAt: new Date().toISOString(),
  };
}
