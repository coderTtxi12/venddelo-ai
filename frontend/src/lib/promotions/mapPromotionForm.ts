import type { PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import type { CreateManualPromotionInput } from '@/lib/api/promotions';

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function mapPromotionFormToApi(
  payload: PromotionFormSubmitPayload,
): CreateManualPromotionInput {
  const schedule = payload.schedule;
  const useWeekdays = schedule.useWeekdays && schedule.weekdays.length > 0;

  const input: CreateManualPromotionInput = {
    name: payload.name.trim(),
    image_path: payload.imagePath,
    type: payload.kind === 'bundle' ? 'bundle' : payload.kind,
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

  if (payload.kind === 'percent') {
    input.percent = payload.percent;
  } else if (payload.kind === 'amount') {
    input.amount_cents = Math.round(payload.amount * 100);
  } else if (payload.kind === 'bundle') {
    input.bundle = {
      get_quantity: payload.bundle.getQuantity,
      pay_quantity: payload.bundle.payQuantity,
      pairing_mode: payload.bundle.pairingMode,
    };
  }

  if (payload.scope === 'order' && payload.minOrderAmount > 0) {
    input.min_order_cents = Math.round(payload.minOrderAmount * 100);
  }

  return input;
}
