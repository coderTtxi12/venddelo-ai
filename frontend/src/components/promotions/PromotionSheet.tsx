'use client';

import CouponSheet from '@/components/coupons/CouponSheet';
import { PromotionTemplatePicker } from './PromotionTemplatePicker';
import { PromotionForm, type PromotionFormSubmitPayload } from '@/components/marketing/PromotionForm';
import type { Category, Product } from '@/lib/api/types';
import type { PromotionTemplate } from '@/lib/promotions/templates';
import { emptyFormForTemplate } from '@/lib/promotions/templates';

type PromotionSheetProps = {
  open: boolean;
  mode: 'create' | 'edit';
  template: PromotionTemplate | null;
  initialValues: PromotionFormSubmitPayload | null;
  restaurantId: string;
  accessToken: string;
  categories: Category[];
  products: Product[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onTemplateSelect: (template: PromotionTemplate) => void;
  onSubmit: (payload: PromotionFormSubmitPayload) => Promise<void>;
};

export default function PromotionSheet({
  open,
  mode,
  template,
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
  const showTemplatePicker = mode === 'create' && template == null;
  const resolvedTemplate = template ?? 'bundle';
  const formValues = initialValues ?? (template ? emptyFormForTemplate(template) : null);

  return (
    <CouponSheet
      open={open}
      title={mode === 'edit' ? 'Editar promoción' : 'Nueva promoción'}
      subtitle={
        showTemplatePicker
          ? 'Elige el tipo de promoción que quieres crear.'
          : mode === 'edit'
            ? 'Actualiza la configuración de la promoción.'
            : undefined
      }
      onClose={onClose}
    >
      {showTemplatePicker ? (
        <PromotionTemplatePicker value={null} onSelect={onTemplateSelect} />
      ) : formValues ? (
        <PromotionForm
          restaurantId={restaurantId}
          accessToken={accessToken}
          categories={categories}
          products={products}
          saving={saving}
          error={error}
          mode={mode}
          template={resolvedTemplate}
          initialValues={formValues}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </CouponSheet>
  );
}
