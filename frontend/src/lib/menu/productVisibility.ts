import type { ProductStatus } from '@/lib/api/types';
import type { ProductDraft } from '@/services/db/supplierCatalogTypes';

export type ProductVisibilityState = 'live' | 'hidden' | 'inactive';

type VisibilityFields = {
  status?: ProductStatus;
};

export type ProductVisibilityCategoryContext = {
  hasActiveCategory?: boolean;
  hasInactiveCategory?: boolean;
};

function resolveVisibilityHelp(
  state: ProductVisibilityState,
  baseHelp: string,
  categoryContext?: ProductVisibilityCategoryContext,
): string {
  if (!categoryContext?.hasInactiveCategory) {
    return baseHelp;
  }

  if (state === 'live') {
    if (!categoryContext.hasActiveCategory) {
      return 'No aparece en el menú público porque sus categorías están inactivas. Reactívalas o asigna una categoría activa.';
    }
    return 'Visible en categorías activas; las categorías inactivas no se muestran en el menú público.';
  }

  if (state === 'inactive') {
    if (!categoryContext.hasActiveCategory) {
      return 'No aparece en el menú público: el producto está inactivo y sus categorías están desactivadas.';
    }
    return 'Visible en categorías activas, pero no se puede vender. Las categorías inactivas no se muestran en el menú público.';
  }

  return baseHelp;
}

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

export function productVisibilityMeta(
  product: VisibilityFields,
  categoryContext?: ProductVisibilityCategoryContext,
): {
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
    help: resolveVisibilityHelp(state, option.help, categoryContext),
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
