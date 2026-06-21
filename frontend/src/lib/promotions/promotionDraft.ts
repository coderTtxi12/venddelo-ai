import type { PromotionScope } from '@/lib/api/promotions';
import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';

/** Tipos de descuento soportados en el borrador (UI). La API aún no persiste todos. */
export type PromotionDraftKind = 'percent' | 'amount' | 'bundle' | 'combo';

export type BundlePairingMode = 'cross_product' | 'same_product';

export type BundleDeal = {
  /** Unidades totales en la oferta (ej. 2 en 2×1). */
  getQuantity: number;
  /** Unidades que paga el cliente (ej. 1 en 2×1). */
  payQuantity: number;
  /** cross_product = distintos productos; same_product = mismo producto solamente. */
  pairingMode: BundlePairingMode;
};

export type PromotionScheduleDraft = {
  /** Si false, aplica todos los días (dentro de la vigencia de campaña). */
  useWeekdays: boolean;
  /** 0=Lunes … 6=Domingo (misma convención que horarios del restaurante). */
  weekdays: number[];
  /** Si false, aplica todo el día en los días seleccionados. */
  useTimeWindow: boolean;
  dailyStartTime: string;
  dailyEndTime: string;
};

export type PromotionComplementRef = {
  productId: string;
  productName: string;
  groupId: string;
  groupTitle: string;
  optionItemId: string;
  optionLabel: string;
};

export type PromotionDraft = {
  id: string;
  restaurantId: string;
  name: string;
  kind: PromotionDraftKind;
  scope: PromotionScope;
  percent: number;
  amount: number;
  bundle: BundleDeal;
  minOrderAmount: number;
  productIds: string[];
  categoryIds: string[];
  complementOptionItemIds: string[];
  schedule: PromotionScheduleDraft;
  campaignStartsAt: string;
  campaignEndsAt: string;
  createdAt: string;
  updatedAt: string;
};

export const BUNDLE_PRESETS: { label: string; getQuantity: number; payQuantity: number }[] = [
  { label: '2×1', getQuantity: 2, payQuantity: 1 },
  { label: '3×1', getQuantity: 3, payQuantity: 1 },
  { label: '3×2', getQuantity: 3, payQuantity: 2 },
  { label: '4×3', getQuantity: 4, payQuantity: 3 },
];

export const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const STORAGE_PREFIX = 'venddelo:promotion-drafts:';

export function formatBundleLabel(bundle: BundleDeal): string {
  return `${bundle.getQuantity}×${bundle.payQuantity}`;
}

export function createEmptyPromotionDraft(): Omit<
  PromotionDraft,
  'id' | 'restaurantId' | 'createdAt' | 'updatedAt'
> {
  return {
    name: '',
    kind: 'bundle',
    scope: 'product',
    percent: 10,
    amount: 0,
    bundle: { getQuantity: 2, payQuantity: 1, pairingMode: 'cross_product' },
    minOrderAmount: 0,
    productIds: [],
    categoryIds: [],
    complementOptionItemIds: [],
    schedule: {
      useWeekdays: false,
      weekdays: [],
      useTimeWindow: false,
      dailyStartTime: '09:00',
      dailyEndTime: '22:00',
    },
    campaignStartsAt: '',
    campaignEndsAt: '',
  };
}

function storageKey(restaurantId: string): string {
  return `${STORAGE_PREFIX}${restaurantId}`;
}

export function loadPromotionDrafts(restaurantId: string): PromotionDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromotionDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePromotionDraft(restaurantId: string, draft: PromotionDraft): void {
  const drafts = loadPromotionDrafts(restaurantId);
  const next = drafts.some((d) => d.id === draft.id)
    ? drafts.map((d) => (d.id === draft.id ? draft : d))
    : [draft, ...drafts];
  window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
}

export function deletePromotionDraft(restaurantId: string, draftId: string): void {
  const next = loadPromotionDrafts(restaurantId).filter((d) => d.id !== draftId);
  window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
}

export function kindLabel(kind: PromotionDraftKind): string {
  if (kind === 'percent') return 'Porcentaje';
  if (kind === 'amount') return 'Monto fijo';
  if (kind === 'bundle') return 'NxM';
  return 'Combo';
}

export function draftDiscountSummary(draft: PromotionDraft): string {
  if (draft.kind === 'percent') return `${draft.percent}%`;
  if (draft.kind === 'amount') return `$${draft.amount.toFixed(2)}`;
  if (draft.kind === 'bundle') return formatBundleLabel(draft.bundle);
  return 'Combo';
}

export function draftScheduleSummary(draft: PromotionDraft): string {
  const parts: string[] = [];

  if (draft.schedule.useWeekdays && draft.schedule.weekdays.length > 0) {
    const days = [...draft.schedule.weekdays]
      .sort((a, b) => a - b)
      .map((i) => WEEKDAY_LABELS[i])
      .join(', ');
    parts.push(days);
  } else if (draft.schedule.useWeekdays) {
    parts.push('Sin días');
  }

  if (draft.schedule.useTimeWindow) {
    parts.push(`${draft.schedule.dailyStartTime}–${draft.schedule.dailyEndTime}`);
  }

  if (!draft.campaignStartsAt && !draft.campaignEndsAt && parts.length === 0) {
    return 'Siempre';
  }

  if (draft.campaignStartsAt || draft.campaignEndsAt) {
    const fmt = (value: string) =>
      new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    if (draft.campaignStartsAt && draft.campaignEndsAt) {
      parts.push(`${fmt(draft.campaignStartsAt)} – ${fmt(draft.campaignEndsAt)}`);
    } else if (draft.campaignStartsAt) {
      parts.push(`Desde ${fmt(draft.campaignStartsAt)}`);
    } else {
      parts.push(`Hasta ${fmt(draft.campaignEndsAt)}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'Siempre';
}
