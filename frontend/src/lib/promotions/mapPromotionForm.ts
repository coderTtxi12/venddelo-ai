import type { PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import type { CreateManualPromotionInput, PromotionType } from '@/lib/api/promotions';

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function resolvePromotionType(payload: PromotionFormSubmitPayload): PromotionType {
  if (payload.kind === 'bundle') return 'bundle';
  if (
    payload.scope === 'product' &&
    payload.productIds.length >= 2 &&
    payload.kind !== 'bundle'
  ) {
    return 'combo';
  }
  if (payload.kind === 'free_shipping') return 'free_shipping';
  if (payload.kind === 'amount') return 'amount';
  return 'percent';
}

export function mapPromotionFormToApi(
  payload: PromotionFormSubmitPayload,
): CreateManualPromotionInput {
  const schedule = payload.schedule;
  const useWeekdays = schedule.useWeekdays && schedule.weekdays.length > 0;
  const type = resolvePromotionType(payload);

  const input: CreateManualPromotionInput = {
    name: payload.name.trim(),
    image_path: payload.imagePath,
    show_banner: payload.showBanner,
    type,
    scope: payload.scope,
    product_ids: payload.productIds,
    category_ids: payload.categoryIds,
    option_item_ids: payload.complementOptionItemIds,
    starts_at: toIsoOrNull(payload.campaignStartsAt),
    ends_at: toIsoOrNull(payload.campaignEndsAt),
    schedule: {
      weekdays: useWeekdays ? schedule.weekdays : [],
      use_time_window: schedule.useTimeWindow,
      daily_start_time: schedule.useTimeWindow ? schedule.dailyStartTime : null,
      daily_end_time: schedule.useTimeWindow ? schedule.dailyEndTime : null,
    },
  };

  if (type === 'bundle') {
    input.bundle = {
      get_quantity: payload.bundle.getQuantity,
      pay_quantity: payload.bundle.payQuantity,
      pairing_mode: payload.bundle.pairingMode,
    };
  } else if (type === 'free_shipping') {
    input.percent = null;
    input.amount_cents = null;
  } else if (type === 'combo') {
    if (payload.kind === 'free_shipping') {
      input.percent = null;
      input.amount_cents = null;
    } else if (payload.kind === 'amount') {
      input.amount_cents = Math.round(payload.amount * 100);
      input.percent = null;
    } else {
      input.percent = payload.percent;
      input.amount_cents = null;
    }
  } else if (type === 'percent') {
    input.percent = payload.percent;
    input.amount_cents = null;
  } else if (type === 'amount') {
    input.amount_cents = Math.round(payload.amount * 100);
    input.percent = null;
  }

  if (payload.scope === 'order' && payload.minOrderAmount > 0) {
    input.min_order_cents = Math.round(payload.minOrderAmount * 100);
  }

  return input;
}
