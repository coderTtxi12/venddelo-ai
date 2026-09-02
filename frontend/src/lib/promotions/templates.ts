import type { Promotion } from '@/lib/api/types';
import { createEmptyPromotionDraft } from './promotionDraft';
import type { PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import { promotionTemplate } from './filters';

export type PromotionTemplate = 'product_discount' | 'bundle' | 'combo' | 'order_threshold';

export const PROMOTION_TEMPLATE_OPTIONS: {
  id: PromotionTemplate;
  title: string;
  description: string;
}[] = [
  {
    id: 'product_discount',
    title: 'Descuento en producto',
    description: 'Porcentaje o monto fijo en uno o más productos.',
  },
  {
    id: 'bundle',
    title: 'N×M',
    description: 'Lleva N y paga M en productos o categorías.',
  },
  {
    id: 'combo',
    title: 'Combo',
    description: 'Descuento cuando el cliente lleva todos los productos del combo.',
  },
  {
    id: 'order_threshold',
    title: 'Umbral de carrito',
    description: 'Descuento o envío gratis al superar un monto mínimo.',
  },
];

export function emptyFormForTemplate(template: PromotionTemplate): PromotionFormSubmitPayload {
  const base = createEmptyPromotionDraft();
  if (template === 'product_discount') {
    return {
      ...base,
      kind: 'percent',
      scope: 'product',
      showBanner: true,
    };
  }
  if (template === 'bundle') {
    return {
      ...base,
      kind: 'bundle',
      scope: 'product',
      bundle: { ...base.bundle, pairingMode: 'same_product' },
      showBanner: true,
    };
  }
  if (template === 'combo') {
    return {
      ...base,
      kind: 'percent',
      scope: 'product',
      percent: 10,
      showBanner: true,
    };
  }
  return {
    ...base,
    kind: 'percent',
    scope: 'order',
    minOrderAmount: 0,
    showBanner: true,
  };
}

export function templateFromPromotion(promotion: Promotion): PromotionTemplate {
  const mapped = promotionTemplate(promotion);
  if (mapped === 'catalog' || mapped === 'product_discount') return 'product_discount';
  if (mapped === 'bundle') return 'bundle';
  if (mapped === 'combo') return 'combo';
  return 'order_threshold';
}
