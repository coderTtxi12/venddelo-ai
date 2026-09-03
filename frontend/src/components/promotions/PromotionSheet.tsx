'use client';

import { useMemo } from 'react';
import CouponSheet from '@/components/coupons/CouponSheet';
import { PromotionTemplatePicker } from './PromotionTemplatePicker';
import { PromotionForm, type PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import type { Category, Product, Promotion } from '@/lib/api/types';
import type { PromotionTemplate } from '@/lib/promotions/templates';
import { emptyFormForTemplate, PROMOTION_TEMPLATE_OPTIONS } from '@/lib/promotions/templates';
import { PromotionCatalogDetail } from './PromotionCatalogDetail';
import { promotionDisplayName } from '@/lib/promotions/display';

type PromotionSheetProps = {
  open: boolean;
  mode: 'create' | 'edit';
  template: PromotionTemplate | null;
  catalogPromotion?: Promotion | null;
  editingPromotionId?: string | null;
  initialValues: PromotionFormSubmitPayload | null;
  restaurantId: string;
  accessToken: string;
  categories: Category[];
  products: Product[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onTemplateSelect: (template: PromotionTemplate | null) => void;
  onSubmit: (payload: PromotionFormSubmitPayload) => Promise<void>;
};

function templateTitle(template: PromotionTemplate): string {
  return PROMOTION_TEMPLATE_OPTIONS.find((option) => option.id === template)?.title ?? 'Nueva promoción';
}

export default function PromotionSheet({
  open,
  mode,
  template,
  catalogPromotion = null,
  editingPromotionId = null,
  initialValues,
  restaurantId,
  accessToken,
  categories,
  products,
  saving,
  error,
  onClose,
  onTemplateSelect,
  onSubmit,
}: PromotionSheetProps) {
  const showCatalogDetail = catalogPromotion != null;
  const showTemplatePicker = mode === 'create' && template == null && !showCatalogDetail;
  const resolvedTemplate = template ?? 'bundle';

  // Stable draft while typing. Re-create only when template / edit target changes —
  // not on every parent re-render (tab focus, auth refresh, etc.).
  const formValues = useMemo(() => {
    if (initialValues) return initialValues;
    if (!template) return null;
    return emptyFormForTemplate(template);
  }, [initialValues, template]);

  const formInstanceKey =
    mode === 'edit'
      ? `edit:${editingPromotionId ?? 'unknown'}`
      : `create:${template ?? 'none'}`;

  const title = showCatalogDetail
    ? promotionDisplayName(catalogPromotion)
    : showTemplatePicker
      ? 'Nueva promoción'
      : mode === 'edit'
        ? 'Editar promoción'
        : templateTitle(resolvedTemplate);

  const subtitle = showCatalogDetail
    ? 'Descuento vinculado al producto'
    : showTemplatePicker
      ? 'Elige el tipo de promoción que quieres crear.'
      : mode === 'edit'
        ? 'Actualiza la configuración de la promoción.'
        : mode === 'create' && template
          ? 'Completa los datos y guarda cuando esté listo.'
          : undefined;

  return (
    <CouponSheet open={open} title={title} subtitle={subtitle} onClose={onClose}>
      {showCatalogDetail ? (
        <PromotionCatalogDetail
          promotion={catalogPromotion}
          products={products}
          onClose={onClose}
        />
      ) : showTemplatePicker ? (
        <PromotionTemplatePicker
          value={null}
          onSelect={(next) => onTemplateSelect(next)}
        />
      ) : formValues ? (
        <PromotionForm
          key={formInstanceKey}
          restaurantId={restaurantId}
          accessToken={accessToken}
          categories={categories}
          products={products}
          saving={saving}
          error={error}
          mode={mode}
          template={resolvedTemplate}
          initialValues={formValues}
          onBackToTemplates={mode === 'create' ? () => onTemplateSelect(null) : undefined}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </CouponSheet>
  );
}
