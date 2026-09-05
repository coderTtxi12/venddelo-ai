import type { Promotion } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { PRODUCT_CATALOG_DISCOUNT_PREFIX } from './productCatalogDiscount';
import { promotionTemplate, type PromotionTemplateFilter } from './filters';

export function promotionDisplayName(promotion: Promotion): string {
  if (promotion.name.startsWith(PRODUCT_CATALOG_DISCOUNT_PREFIX)) {
    const stripped = promotion.name.slice(PRODUCT_CATALOG_DISCOUNT_PREFIX.length).trim();
    return stripped || '(descuento de producto)';
  }
  return promotion.name;
}

export function promotionTemplateLabel(template: PromotionTemplateFilter): string {
  if (template === 'all') return 'Promoción';
  if (template === 'product_discount') return 'Descuento en producto';
  if (template === 'bundle') return 'N×M';
  if (template === 'combo') return 'Combo';
  if (template === 'order_threshold') return 'Umbral de carrito';
  return 'Desde catálogo';
}

export function promotionTypeLabel(promotion: Promotion): string {
  return promotionTemplateLabel(promotionTemplate(promotion));
}

export function promotionScopeLabel(scope: Promotion['scope']): string {
  if (scope === 'product') return 'Producto(s)';
  if (scope === 'category') return 'Categoría(s)';
  return 'Pedido completo';
}

export function promotionBenefitLabel(promotion: Promotion): string {
  if (promotion.type === 'percent' && promotion.percent != null) {
    return `${promotion.percent}%`;
  }
  if (promotion.type === 'amount' && promotion.amount_cents != null) {
    return formatMoney(promotion.amount_cents / 100);
  }
  if (promotion.type === 'free_shipping') return 'Envío gratis';
  if (promotion.type === 'combo') {
    if (promotion.combo_price_cents != null) {
      return `Combo a ${formatMoney(promotion.combo_price_cents / 100)}`;
    }
    if (promotion.percent != null) return `Combo ${promotion.percent}%`;
    if (promotion.amount_cents != null) {
      return `Combo −${formatMoney(promotion.amount_cents / 100)}`;
    }
    return 'Combo · Envío gratis';
  }
  if (promotion.type === 'bundle' || promotion.type === '2x1') {
    const getQ = promotion.bundle?.get_quantity ?? 2;
    const payQ = promotion.bundle?.pay_quantity ?? 1;
    return `${getQ}×${payQ}`;
  }
  return '—';
}

export function promotionStatusLabel(promotion: Promotion): string {
  if (promotion.effective_status === 'active') return 'Vigente ahora';
  if (promotion.effective_status === 'scheduled') return 'Programada';
  if (promotion.effective_status === 'expired') return 'Expirada';
  if (promotion.effective_status === 'outside_schedule') return 'Fuera de horario';
  if (promotion.effective_status === 'inactive') return 'Pausada';
  return promotion.is_active ? 'Activa' : 'Pausada';
}

export function formatPromotionDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return 'Sin vigencia';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `Desde ${fmt(startsAt)}`;
  return `Hasta ${fmt(endsAt!)}`;
}

export function promotionMinOrderLabel(promotion: Promotion): string | null {
  if (!promotion.min_order_cents) return null;
  return `Mín. ${formatMoney(promotion.min_order_cents / 100)}`;
}
