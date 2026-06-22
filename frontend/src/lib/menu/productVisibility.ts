import type { ApprovalStatus, ProductDraft } from '@/services/db/supplierCatalogTypes';

export type ProductVisibilityState = 'live' | 'hidden' | 'inactive';

type VisibilityFields = {
  is_active?: boolean;
  is_published?: boolean;
  approval_status?: string;
  isActive?: boolean;
  isPublished?: boolean;
  approvalStatus?: string;
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
  const published = product.is_published ?? product.isPublished ?? false;
  const status = product.approval_status ?? product.approvalStatus ?? 'draft';
  return published && status === 'approved';
}

export function getProductVisibilityState(product: VisibilityFields): ProductVisibilityState {
  const active = product.is_active ?? product.isActive ?? false;
  if (isPublicMenuListed(product)) {
    return active ? 'live' : 'inactive';
  }
  if (!active) return 'inactive';
  return 'hidden';
}

/** Product is visible in the public menu and can be ordered. */
export function isLiveMenuVisible(product: VisibilityFields): boolean {
  const active = product.is_active ?? product.isActive ?? false;
  return active && isPublicMenuListed(product);
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
  is_active: boolean;
  is_published: boolean;
  approval_status: ApprovalStatus;
} {
  switch (state) {
    case 'live':
      return { is_active: true, is_published: true, approval_status: 'approved' };
    case 'hidden':
      return { is_active: true, is_published: false, approval_status: 'draft' };
    case 'inactive':
      return { is_active: false, is_published: true, approval_status: 'approved' };
  }
}

export function applyVisibilityStateToDraft(
  product: ProductDraft,
  state: ProductVisibilityState,
): ProductDraft {
  const patch = visibilityUpdateForState(state);
  return {
    ...product,
    isActive: patch.is_active,
    isPublished: patch.is_published,
    approvalStatus: patch.approval_status,
    updatedAt: new Date().toISOString(),
  };
}
