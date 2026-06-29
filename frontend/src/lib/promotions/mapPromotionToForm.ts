import type { Promotion } from '@/lib/api/types';
import type { PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import { createEmptyPromotionDraft } from '@/lib/promotions/promotionDraft';

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function mapKind(promotion: Promotion): PromotionFormSubmitPayload['kind'] {
  if (promotion.type === 'bundle' || promotion.type === '2x1') return 'bundle';
  if (promotion.type === 'percent') return 'percent';
  if (promotion.type === 'amount') return 'amount';
  return 'bundle';
}

export function mapPromotionToForm(promotion: Promotion): PromotionFormSubmitPayload {
  const empty = createEmptyPromotionDraft();
  const schedule = promotion.schedule;
  const weekdays = schedule?.weekdays?.length
    ? schedule.weekdays
    : (promotion.recurrence_weekdays ?? []);

  const dailyStart =
    schedule?.daily_start_time ??
    (promotion.recurrence_start_time ? promotion.recurrence_start_time.slice(0, 5) : empty.schedule.dailyStartTime);
  const dailyEnd =
    schedule?.daily_end_time ??
    (promotion.recurrence_end_time ? promotion.recurrence_end_time.slice(0, 5) : empty.schedule.dailyEndTime);

  return {
    name: promotion.name,
    kind: mapKind(promotion),
    scope: promotion.scope,
    percent: promotion.percent ?? empty.percent,
    amount: (promotion.amount_cents ?? 0) / 100,
    bundle: {
      getQuantity: promotion.bundle?.get_quantity ?? empty.bundle.getQuantity,
      payQuantity: promotion.bundle?.pay_quantity ?? empty.bundle.payQuantity,
      pairingMode:
        (promotion.bundle?.pairing_mode as 'cross_product' | 'same_product' | undefined) ??
        'same_product',
    },
    minOrderAmount: (promotion.min_order_cents ?? 0) / 100,
    productIds: [...(promotion.product_ids ?? [])],
    categoryIds: [...(promotion.category_ids ?? [])],
    complementOptionItemIds: [...(promotion.option_item_ids ?? [])],
    schedule: {
      useWeekdays: weekdays.length > 0,
      weekdays: [...weekdays],
      useTimeWindow:
        schedule?.use_time_window ??
        Boolean(promotion.recurrence_start_time || promotion.recurrence_end_time),
      dailyStartTime: dailyStart,
      dailyEndTime: dailyEnd,
    },
    campaignStartsAt: toDatetimeLocalValue(promotion.starts_at),
    campaignEndsAt: toDatetimeLocalValue(promotion.ends_at),
    imagePath: promotion.image_path ?? null,
  };
}

export const PROMOTION_STATUS_HELP: Record<string, string> = {
  active: 'Aplica ahora mismo en el menú y el carrito (reloj del servidor + zona horaria del restaurante).',
  scheduled: 'La fecha de inicio de campaña aún no llega.',
  expired: 'La fecha de fin de campaña ya pasó.',
  outside_schedule: 'Activa en el sistema, pero hoy u hora actual no coincide con los días/horario configurados.',
  inactive: 'Desactivada en el sistema.',
};
