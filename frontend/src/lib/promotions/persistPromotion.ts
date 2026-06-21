import type { PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import type { CreateManualPromotionInput } from '@/lib/api/promotions';
import { createPromotion, updatePromotion } from '@/lib/api/promotions';
import type { Promotion } from '@/lib/api/types';
import { mapPromotionFormToApi } from '@/lib/promotions/mapPromotionForm';

function toUpdateBody(api: CreateManualPromotionInput): Partial<CreateManualPromotionInput> {
  return {
    name: api.name,
    type: api.type,
    scope: api.scope,
    percent: api.percent,
    amount_cents: api.amount_cents,
    min_order_cents: api.min_order_cents,
    starts_at: api.starts_at,
    ends_at: api.ends_at,
    bundle: api.bundle,
    schedule: api.schedule,
    product_ids: api.product_ids ?? [],
    category_ids: api.category_ids ?? [],
    option_item_ids: api.option_item_ids ?? [],
  };
}

/** Persist a promotion in one API round-trip (create or full PATCH update). */
export async function persistPromotion(
  token: string,
  restaurantId: string,
  payload: PromotionFormSubmitPayload,
  editingPromotionId?: string | null,
): Promise<Promotion> {
  const api = mapPromotionFormToApi(payload);

  if (editingPromotionId) {
    return updatePromotion(token, restaurantId, editingPromotionId, toUpdateBody(api));
  }

  return createPromotion(token, restaurantId, api);
}
