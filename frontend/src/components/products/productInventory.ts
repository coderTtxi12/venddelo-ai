import type { ProductStatus } from '@/lib/api/types';

export type InventoryExpiryInput = {
  expiresOn: string | null;
  shelfLifeDays: number | null;
  batchStartedAt: string | null;
};

export function effectiveExpiresOn({
  expiresOn,
  shelfLifeDays,
  batchStartedAt,
}: InventoryExpiryInput): string | null {
  if (expiresOn) return expiresOn;
  if (shelfLifeDays == null || !batchStartedAt) return null;
  const started = new Date(batchStartedAt);
  if (Number.isNaN(started.getTime())) return null;
  return addLocalDays(todayIsoDate(started), shelfLifeDays);
}

export type ExpiryUrgency = 'none' | 'today' | 'expired';

export function expiryUrgency(expiresOn: string | null, today: string): ExpiryUrgency {
  if (!expiresOn) return 'none';
  if (expiresOn < today) return 'expired';
  if (expiresOn === today) return 'today';
  return 'none';
}

export function productExpiryUrgency(
  product: {
    expiresOn?: string | null;
    shelfLifeDays?: number | null;
    batchStartedAt?: string | null;
  },
  today: string,
): ExpiryUrgency {
  return expiryUrgency(
    effectiveExpiresOn({
      expiresOn: product.expiresOn ?? null,
      shelfLifeDays: product.shelfLifeDays ?? null,
      batchStartedAt: product.batchStartedAt ?? null,
    }),
    today,
  );
}

export function ownerInventoryChips({
  inventoryQty,
  status,
  expiresOn,
  today,
}: {
  inventoryQty: number | null;
  status: ProductStatus;
  expiresOn: string | null;
  today: string;
}): string[] {
  const chips: string[] = [];
  if (inventoryQty == null) return chips;
  if (inventoryQty === 0 || status === 'inactive') {
    chips.push('Agotado');
  } else {
    chips.push(`${inventoryQty} pzas`);
  }
  if (!expiresOn) return chips;
  if (expiresOn < today) {
    chips.push('Vencida · posible merma');
  } else if (expiresOn === today) {
    chips.push('Caduca hoy');
  } else {
    const days = Math.round(
      (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
        86_400_000,
    );
    chips.push(days === 1 ? 'Caduca en 1 día' : `Caduca en ${days} días`);
  }
  return chips;
}

export function parseOptionalQty(value: string): number | null {
  const parsed = parseInventoryQtyDraft(value);
  return parsed.ok ? parsed.qty : null;
}

export type InventoryQtyDraft =
  | { ok: true; qty: number | null }
  | { ok: false };

export function parseInventoryQtyDraft(value: string): InventoryQtyDraft {
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, qty: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return { ok: false };
  return { ok: true, qty: parsed };
}

export function inventoryQtyNeedsSave(draft: string, savedQty: number | null): boolean {
  const parsed = parseInventoryQtyDraft(draft);
  if (!parsed.ok) return false;
  return parsed.qty !== savedQty;
}

export type ExpiryDraft =
  | { mode: 'none' }
  | { mode: 'days'; days: number }
  | { mode: 'date'; date: string };

export const EXPIRY_PRESET_DAYS = [1, 2, 7] as const;

export function expiryDraftFromProduct({
  expiresOn,
  shelfLifeDays,
}: {
  expiresOn: string | null;
  shelfLifeDays: number | null;
}): ExpiryDraft {
  if (expiresOn) return { mode: 'date', date: expiresOn };
  if (shelfLifeDays != null && shelfLifeDays >= 1) {
    return { mode: 'days', days: shelfLifeDays };
  }
  return { mode: 'none' };
}

export function expirySelectValue(
  draft: ExpiryDraft,
  today?: string,
): 'none' | 'today' | '1' | '2' | '7' | 'custom' | 'date' {
  if (draft.mode === 'none') return 'none';
  if (draft.mode === 'date') {
    if (!today) return 'date';
    const delta = calendarDaysBetween(today, draft.date);
    if (delta === 0) return 'today';
    if (delta === 1) return '1';
    if (delta === 2) return '2';
    if (delta === 7) return '7';
    return 'date';
  }
  if ((EXPIRY_PRESET_DAYS as readonly number[]).includes(draft.days)) {
    return String(draft.days) as '1' | '2' | '7';
  }
  return 'custom';
}

export function sameExpiryDraft(a: ExpiryDraft, b: ExpiryDraft): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'days' && b.mode === 'days') return a.days === b.days;
  if (a.mode === 'date' && b.mode === 'date') return a.date === b.date;
  return true;
}

export function parseShelfLifeDaysDraft(
  value: string,
): { ok: true; days: number } | { ok: false } {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return { ok: false };
  return { ok: true, days: parsed };
}

export type ExpirySavePayload = {
  expiresOn: string | null;
  shelfLifeDays: number | null;
};

function resolvedExpiryDate(draft: ExpiryDraft, today: string): string | null {
  if (draft.mode === 'none') return null;
  if (draft.mode === 'date') {
    return /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : null;
  }
  if (!Number.isInteger(draft.days) || draft.days < 1) return null;
  return addLocalDays(today, draft.days);
}

export function expirySavePayload(
  draft: ExpiryDraft,
  current: ExpiryDraft,
  today: string,
): ExpirySavePayload | null {
  if (draft.mode === 'none') {
    if (current.mode === 'none') return null;
    return { expiresOn: null, shelfLifeDays: null };
  }
  const expiresOn = resolvedExpiryDate(draft, today);
  if (expiresOn == null) return null;
  if (current.mode === 'date' && current.date === expiresOn) return null;
  return { expiresOn, shelfLifeDays: null };
}

export function todayIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addLocalDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return todayIsoDate(new Date(year, month - 1, day + days));
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd).getTime();
  const to = new Date(ty, tm - 1, td).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function formatExpiryHint(isoDate: string | null, today: string): string | null {
  if (!isoDate) return null;
  if (isoDate < today) return 'Vencida';
  if (isoDate === today) return 'Caduca hoy';
  const formatted = new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  });
  return `Vence el ${formatted}`;
}
