'use client';

import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category, Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { uploadRestaurantAsset } from '@/lib/storage/upload';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import {
  BUNDLE_PRESETS,
  createEmptyPromotionDraft,
  formatBundleLabel,
  type PromotionDraft,
  WEEKDAY_SHORT,
} from '@/lib/promotions/promotionDraft';
import type { PromotionTemplate } from '@/lib/promotions/templates';
import {
  productDiscountMenuSummary,
  resolveProductDiscountScope,
} from '@/lib/promotions/productDiscountScope';
import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';
import {
  CategoryProductPicker,
  hasMenuSelection,
  menuEligibleProducts,
  normalizeCategorySelection,
} from './CategoryProductPicker';
import styles from './PromotionForm.module.css';

const FORM_ID = 'promotion-form';

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {hint ? <p className={styles.sectionHint}>{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SectionShell({
  asCard,
  title,
  hint,
  children,
}: {
  asCard: boolean;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  if (asCard) {
    return (
      <FormSection title={title} hint={hint}>
        {children}
      </FormSection>
    );
  }
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{title}</legend>
      {children}
    </fieldset>
  );
}

function ChipOption({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${selected ? styles.chipActive : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}

function clampNumber(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export type PromotionFormSubmitPayload = Omit<
  PromotionDraft,
  'id' | 'restaurantId' | 'createdAt' | 'updatedAt'
>;

type FormState = PromotionFormSubmitPayload;

type PromotionFormProps = {
  restaurantId: string;
  accessToken: string;
  categories: Category[];
  products: Product[];
  saving: boolean;
  error: string | null;
  mode?: 'create' | 'edit';
  template?: PromotionTemplate;
  initialValues?: PromotionFormSubmitPayload | null;
  onBackToTemplates?: () => void;
  onCancel: () => void;
  onSubmit: (payload: PromotionFormSubmitPayload) => Promise<void>;
};

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function toggleWeekday(list: number[], dayIndex: number): number[] {
  return list.includes(dayIndex)
    ? list.filter((d) => d !== dayIndex)
    : [...list, dayIndex].sort((a, b) => a - b);
}

function activeOptionItemIdsForProduct(product: Product): string[] {
  const ids: string[] = [];
  for (const group of product.option_groups) {
    if (!group.is_active) continue;
    for (const item of group.items) {
      if (item.is_active) ids.push(item.id);
    }
  }
  return ids;
}


function setComplementChecked(
  complementOptionItemIds: string[],
  itemId: string,
  checked: boolean,
): string[] {
  if (checked) {
    return complementOptionItemIds.includes(itemId)
      ? complementOptionItemIds
      : [...complementOptionItemIds, itemId];
  }
  return complementOptionItemIds.filter((id) => id !== itemId);
}

function setGroupComplementsChecked(
  complementOptionItemIds: string[],
  groupItemIds: string[],
  checked: boolean,
): string[] {
  if (checked) {
    const next = new Set(complementOptionItemIds);
    for (const id of groupItemIds) next.add(id);
    return [...next];
  }
  const remove = new Set(groupItemIds);
  return complementOptionItemIds.filter((id) => !remove.has(id));
}

function cleanupComplementsForRemovedProducts(
  complementOptionItemIds: string[],
  removedProductIds: string[],
  products: Product[],
): string[] {
  if (removedProductIds.length === 0) return complementOptionItemIds;
  const removedOptionIds = new Set<string>();
  for (const productId of removedProductIds) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    for (const id of activeOptionItemIdsForProduct(product)) {
      removedOptionIds.add(id);
    }
  }
  return complementOptionItemIds.filter((id) => !removedOptionIds.has(id));
}

function addComplementsForProducts(
  complementOptionItemIds: string[],
  addedProductIds: string[],
  products: Product[],
): string[] {
  const next = new Set(complementOptionItemIds);
  for (const productId of addedProductIds) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    for (const id of activeOptionItemIdsForProduct(product)) {
      next.add(id);
    }
  }
  return [...next];
}

function getEligibleProductIds(
  scope: FormState['scope'],
  productIds: string[],
  categoryIds: string[],
  products: Product[],
): string[] {
  if (scope === 'product') return productIds;
  if (scope === 'category') {
    return menuEligibleProducts(products, categoryIds, productIds).map((p) => p.id);
  }
  return [];
}

function syncComplementsOnSelectionChange(
  prev: FormState,
  next: Pick<FormState, 'scope' | 'productIds' | 'categoryIds'>,
  products: Product[],
): string[] {
  const prevEligible = new Set(
    getEligibleProductIds(prev.scope, prev.productIds, prev.categoryIds, products),
  );
  const nextEligible = getEligibleProductIds(next.scope, next.productIds, next.categoryIds, products);

  let complementIds = prev.complementOptionItemIds;

  const removed = [...prevEligible].filter((id) => !nextEligible.includes(id));
  if (removed.length > 0) {
    complementIds = cleanupComplementsForRemovedProducts(complementIds, removed, products);
  }

  const added = nextEligible.filter((id) => !prevEligible.has(id));
  if (added.length > 0) {
    complementIds = addComplementsForProducts(complementIds, added, products);
  }

  return complementIds;
}

function bundleMatchesPreset(
  bundle: FormState['bundle'],
  preset: (typeof BUNDLE_PRESETS)[number],
): boolean {
  return bundle.getQuantity === preset.getQuantity && bundle.payQuantity === preset.payQuantity;
}

export function PromotionForm({
  restaurantId,
  accessToken,
  categories,
  products,
  saving,
  error,
  mode = 'create',
  template = 'bundle',
  initialValues = null,
  onBackToTemplates,
  onCancel,
  onSubmit,
}: PromotionFormProps) {
  const [form, setForm] = useState<FormState>(() => initialValues ?? createEmptyPromotionDraft());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialValues ?? createEmptyPromotionDraft());
    setProductSearch('');
    setImageError(null);
  }, [initialValues]);

  const [productSearch, setProductSearch] = useState('');

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const sorted = [...products].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const complementProducts = useMemo(() => {
    if (form.scope === 'order') return [];
    if (form.scope === 'product') {
      return products.filter((p) => form.productIds.includes(p.id));
    }
    return menuEligibleProducts(products, form.categoryIds, form.productIds);
  }, [products, form.scope, form.productIds, form.categoryIds]);

  const complementCount = form.complementOptionItemIds.length;

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.showBanner && !form.imagePath?.trim()) return false;

    if (template === 'bundle') {
      if (form.bundle.getQuantity < 2) return false;
      if (form.bundle.payQuantity < 1) return false;
      if (form.bundle.payQuantity >= form.bundle.getQuantity) return false;
      if (form.scope === 'product' && form.productIds.length === 0) return false;
      if (form.scope === 'category' && !hasMenuSelection(form.categoryIds, form.productIds)) {
        return false;
      }
    }

    if (template === 'product_discount') {
      if (!hasMenuSelection(form.categoryIds, form.productIds)) return false;
      if (form.kind === 'percent' && (form.percent < 1 || form.percent > 100)) return false;
      if (form.kind === 'amount' && form.amount <= 0) return false;
    }

    if (template === 'combo') {
      if (form.productIds.length < 2) return false;
      if (form.kind === 'percent' && (form.percent < 1 || form.percent > 100)) return false;
      if (form.kind === 'amount' && form.amount <= 0) return false;
      if (form.kind === 'free_shipping') return true;
    }

    if (template === 'order_threshold') {
      if (form.minOrderAmount <= 0) return false;
      if (form.kind === 'percent' && (form.percent < 1 || form.percent > 100)) return false;
      if (form.kind === 'amount' && form.amount <= 0) return false;
    }

    if (form.schedule.useWeekdays && form.schedule.weekdays.length === 0) return false;

    if (form.schedule.useTimeWindow) {
      if (!form.schedule.dailyStartTime || !form.schedule.dailyEndTime) return false;
      if (form.schedule.dailyStartTime >= form.schedule.dailyEndTime) return false;
    }

    if (form.campaignStartsAt && form.campaignEndsAt) {
      if (new Date(form.campaignStartsAt) >= new Date(form.campaignEndsAt)) return false;
    }

    return true;
  }, [form, template]);

  const previewLabel = useMemo(() => {
    if (template === 'bundle') return formatBundleLabel(form.bundle);
    if (template === 'combo') {
      if (form.kind === 'free_shipping') return 'Combo · Envío gratis';
      if (form.kind === 'amount') return `Combo ${formatMoney(form.amount)}`;
      return `Combo ${form.percent}%`;
    }
    if (template === 'order_threshold') {
      if (form.kind === 'free_shipping') return 'Envío gratis';
      if (form.kind === 'amount') return formatMoney(form.amount);
      return `${form.percent}%`;
    }
    if (form.kind === 'amount') return formatMoney(form.amount);
    return `${form.percent}%`;
  }, [form, template]);

  const hasProductDiscountScope = useMemo(() => {
    if (template !== 'product_discount') return true;
    return hasMenuSelection(form.categoryIds, form.productIds);
  }, [form.categoryIds, form.productIds, template]);

  const productDiscountScopeSummary = useMemo(() => {
    if (template !== 'product_discount') return null;
    return productDiscountMenuSummary(form.categoryIds, form.productIds);
  }, [form.categoryIds, form.productIds, template]);

  const promoImageUrl = storagePublicUrl(form.imagePath);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    setImageError(null);
    try {
      const path = await uploadRestaurantAsset(accessToken, restaurantId, 'promotions', file);
      setForm((prev) => ({ ...prev, imagePath: path }));
    } catch {
      setImageError('No se pudo subir la imagen. Usa JPG o PNG de hasta 2 MB.');
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.scroll}>
        <form
          id={FORM_ID}
          className={styles.form}
          onSubmit={(e) => {
        e.preventDefault();
        const normalized =
          form.scope === 'category'
            ? {
                ...form,
                ...normalizeCategorySelection(form.categoryIds, form.productIds, products),
              }
            : form;
        const payload =
          template === 'combo'
            ? {
                ...normalized,
                kind:
                  normalized.kind === 'free_shipping'
                    ? 'free_shipping'
                    : normalized.kind === 'amount'
                      ? 'amount'
                      : 'percent',
                scope: 'product' as const,
              }
            : template === 'order_threshold'
              ? {
                  ...normalized,
                  scope: 'order' as const,
                  kind:
                    normalized.kind === 'free_shipping'
                      ? 'free_shipping'
                      : normalized.kind === 'amount'
                        ? 'amount'
                        : 'percent',
                }
              : template === 'product_discount'
                ? {
                    ...normalized,
                    kind: normalized.kind === 'amount' ? 'amount' : 'percent',
                    ...resolveProductDiscountScope(
                      normalized.categoryIds,
                      normalized.productIds,
                      products,
                    ),
                  }
                : {
                    ...normalized,
                    kind: 'bundle' as const,
                    bundle: { ...normalized.bundle, pairingMode: 'same_product' as const },
                  };
        void onSubmit(payload as PromotionFormSubmitPayload);
      }}
    >
      {onBackToTemplates ? (
        <button type="button" className={styles.backLink} onClick={onBackToTemplates}>
          ← Cambiar tipo de promoción
        </button>
      ) : null}

      <div className={styles.infoBanner} role="status">
        {template === 'bundle'
          ? 'Configura días, horarios, ofertas N×M y complementos. La promoción se aplicará en el menú público y en el carrito.'
          : template === 'combo'
            ? 'El descuento aplica cuando el cliente lleva todos los productos del combo en el carrito.'
            : template === 'order_threshold'
              ? 'El beneficio aplica al superar el monto mínimo del carrito.'
              : 'El precio con descuento se muestra en el menú y se aplica automáticamente en el carrito.'}
      </div>

      <div
        className={
          template === 'product_discount' && !hasProductDiscountScope
            ? `${styles.previewCard} ${styles.previewCardAttention}`
            : styles.previewCard
        }
      >
        <span className={styles.previewLabel}>Vista previa</span>
        <strong className={styles.previewValue}>{previewLabel}</strong>
        {template === 'product_discount' && productDiscountScopeSummary ? (
          <span className={styles.previewMeta}>{productDiscountScopeSummary}</span>
        ) : null}
        {form.schedule.useWeekdays && form.schedule.weekdays.length > 0 ? (
          <span className={styles.previewMeta}>
            {form.schedule.weekdays.map((d: number) => WEEKDAY_LABELS[d]).join(' · ')}
          </span>
        ) : null}
        {template === 'product_discount' && !hasProductDiscountScope ? (
          <span className={styles.previewHint}>Selecciona productos o categorías abajo.</span>
        ) : null}
      </div>

      <FormSection
        title="Identidad"
        hint={
          template === 'product_discount'
            ? 'Nombre e imagen del banner que verán tus clientes en el menú.'
            : 'Nombre e imagen que verán tus clientes en el menú.'
        }
      >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="promo-name">
          Nombre de la promoción
        </label>
        <input
          id="promo-name"
          className={styles.input}
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={
            template === 'product_discount'
              ? 'Ej. 20% en hamburguesas, Promo postres'
              : 'Ej. Miércoles pizza 2×1, Happy hour bebidas'
          }
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="promo-image">
          Imagen promocional {form.showBanner ? <span className={styles.requiredMark}>*</span> : null}
        </label>
        <p className={styles.helpText} id="promo-image-help">
          {form.showBanner
            ? 'Banner del acceso directo en el menú público.'
            : 'Opcional: esta promoción no se mostrará como banner en el menú.'}
        </p>
        <div className={styles.promoImageRow}>
          {promoImageUrl ? (
            <img src={promoImageUrl} alt="" className={styles.promoImagePreview} />
          ) : (
            <div className={styles.promoImagePlaceholder} aria-hidden>
              Sin imagen
            </div>
          )}
          <div className={styles.promoImageActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={uploadingImage || saving}
              onClick={() => imageInputRef.current?.click()}
            >
              {uploadingImage
                ? 'Subiendo…'
                : promoImageUrl
                  ? 'Cambiar imagen'
                  : 'Subir imagen'}
            </button>
            {form.imagePath ? (
              <button
                type="button"
                className={styles.dangerGhostBtn}
                disabled={uploadingImage || saving}
                onClick={() => setForm((prev) => ({ ...prev, imagePath: null }))}
              >
                Quitar
              </button>
            ) : null}
            <input
              ref={imageInputRef}
              id="promo-image"
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              aria-describedby="promo-image-help"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {imageError ? (
          <p className={styles.errorBanner} role="alert">
            {imageError}
          </p>
        ) : null}
      </div>

      {template !== 'order_threshold' ? (
        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleLabel}>Banner en menú digital</span>
            <span className={styles.toggleHint}>
              Muestra un acceso directo en la portada del menú público.
            </span>
          </span>
          <input
            className={styles.toggleInput}
            type="checkbox"
            checked={form.showBanner}
            onChange={(e) => setForm((prev) => ({ ...prev, showBanner: e.target.checked }))}
          />
        </label>
      ) : null}
      </FormSection>

      {template === 'product_discount' ? (
        <FormSection title="Beneficio" hint="Cuánto descuentas en cada producto elegido del menú.">
          <div className={styles.chipGrid} role="group" aria-label="Tipo de descuento">
            {(['percent', 'amount'] as const).map((kind) => (
              <ChipOption
                key={kind}
                selected={form.kind === kind}
                disabled={saving}
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
              >
                {kind === 'percent' ? 'Porcentaje' : 'Monto fijo'}
              </ChipOption>
            ))}
          </div>
          {form.kind === 'percent' ? (
            <label className={styles.field} htmlFor="product-discount-percent">
              <span className={styles.label}>Porcentaje de descuento</span>
              <div className={styles.inputWithSuffix}>
                <input
                  id="product-discount-percent"
                  className={`${styles.input} ${styles.inputSuffixField}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={form.percent}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      percent: clampNumber(Number(e.target.value), 1, 100),
                    }))
                  }
                />
                <span className={styles.inputSuffix} aria-hidden>
                  %
                </span>
              </div>
              <p className={styles.helpText}>Entre 1% y 100%.</p>
            </label>
          ) : (
            <label className={styles.field} htmlFor="product-discount-amount">
              <span className={styles.label}>Monto en pesos (MXN)</span>
              <input
                id="product-discount-amount"
                className={styles.input}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="50"
                value={form.amount}
                disabled={saving}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    amount: Math.max(0, Number(e.target.value)),
                  }))
                }
              />
              <p className={styles.helpText}>Se resta del precio de cada producto incluido.</p>
            </label>
          )}
        </FormSection>
      ) : null}

      {template === 'product_discount' ? null : template === 'combo' ? (
        <div className={styles.field}>
          <p className={styles.label}>Beneficio del combo</p>
          <div className={`${styles.chipGrid} ${styles.chipGridThree}`}>
            {(['percent', 'amount', 'free_shipping'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className={
                  form.kind === kind ? `${styles.chip} ${styles.chipActive}` : styles.chip
                }
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
              >
                {kind === 'percent' ? 'Porcentaje' : kind === 'amount' ? 'Monto fijo' : 'Envío gratis'}
              </button>
            ))}
          </div>
          {form.kind === 'percent' ? (
            <input
              className={styles.input}
              type="number"
              min={1}
              max={100}
              value={form.percent}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  percent: clampNumber(Number(e.target.value), 1, 100),
                }))
              }
            />
          ) : null}
          {form.kind === 'amount' ? (
            <input
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  amount: Math.max(0, Number(e.target.value)),
                }))
              }
            />
          ) : null}
        </div>
      ) : null}

      {template === 'order_threshold' ? (
        <div className={styles.field}>
          <p className={styles.label}>Beneficio al superar el mínimo</p>
          <div className={`${styles.chipGrid} ${styles.chipGridThree}`}>
            {(['percent', 'amount', 'free_shipping'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className={
                  form.kind === kind ? `${styles.chip} ${styles.chipActive}` : styles.chip
                }
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
              >
                {kind === 'percent' ? 'Porcentaje' : kind === 'amount' ? 'Monto fijo' : 'Envío gratis'}
              </button>
            ))}
          </div>
          {form.kind === 'percent' ? (
            <input
              className={styles.input}
              type="number"
              min={1}
              max={100}
              value={form.percent}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  percent: clampNumber(Number(e.target.value), 1, 100),
                }))
              }
            />
          ) : null}
          {form.kind === 'amount' ? (
            <input
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  amount: Math.max(0, Number(e.target.value)),
                }))
              }
            />
          ) : null}
          <label className={styles.label} htmlFor="promo-min-order">
            Monto mínimo del carrito
          </label>
          <input
            id="promo-min-order"
            className={styles.input}
            type="number"
            min={0}
            step="0.01"
            value={form.minOrderAmount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                minOrderAmount: Math.max(0, Number(e.target.value)),
              }))
            }
          />
        </div>
      ) : null}

      {template === 'bundle' ? (
      <div className={styles.field}>
        <p className={styles.label}>¿Cómo se combinan los productos?</p>
          <p className={styles.helpText}>
            Mismo producto: la oferta aplica solo entre unidades del mismo platillo (ej. 2
            hamburguesas del mismo tipo). No mezcla productos distintos en la misma oferta.
          </p>
          <div className={styles.bundleCallout} role="note">
            <p className={styles.bundleCalloutSlogan}>Se cobra el de mayor precio</p>
            <p className={styles.bundleCalloutDetail}>
              La oferta aplica solo entre unidades del mismo producto. El carrito compara el precio
              con descuento de catálogo (si el producto ya lo tiene) y cobra el más caro; el de menor
              precio sale gratis. Los complementos con costo extra se suman siempre.
            </p>
          </div>
          <span className={styles.label}>Oferta N×M</span>
          <p className={styles.helpText}>
            El cliente lleva {form.bundle.getQuantity} y paga {form.bundle.payQuantity}.
          </p>
          <div className={styles.chipGrid}>
            {BUNDLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={
                  bundleMatchesPreset(form.bundle, preset)
                    ? `${styles.chip} ${styles.chipActive}`
                    : styles.chip
                }
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    bundle: {
                      ...prev.bundle,
                      getQuantity: preset.getQuantity,
                      payQuantity: preset.payQuantity,
                    },
                  }))
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label} htmlFor="bundle-get">
                Unidades en la oferta
              </label>
              <input
                id="bundle-get"
                className={styles.input}
                type="number"
                min={2}
                max={99}
                value={form.bundle.getQuantity}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    bundle: {
                      ...prev.bundle,
                      getQuantity: clampNumber(Math.round(Number(e.target.value)), 2, 99),
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="bundle-pay">
                Unidades que paga
              </label>
              <input
                id="bundle-pay"
                className={styles.input}
                type="number"
                min={1}
                max={98}
                value={form.bundle.payQuantity}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    bundle: {
                      ...prev.bundle,
                      payQuantity: clampNumber(Math.round(Number(e.target.value)), 1, 98),
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {template === 'product_discount' ? (
        <FormSection
          title="Menú incluido"
          hint="Marca categorías completas o productos específicos. El descuento se verá en el menú y el carrito."
        >
          <div className={styles.pickerWrap}>
            <CategoryProductPicker
              categories={categories}
              products={products}
              categoryIds={form.categoryIds}
              productIds={form.productIds}
              headerLabel="Categorías y productos"
              helpText="Puedes seleccionar una categoría entera o expandirla para elegir productos."
              searchPlaceholder="Buscar categoría o producto…"
              searchInputId="product-discount-scope-search"
              onSelectionChange={(categoryIds, productIds) =>
                setForm((prev) => ({ ...prev, categoryIds, productIds }))
              }
            />
          </div>

          {!hasProductDiscountScope ? (
            <p className={styles.scopeHint} role="status">
              Selecciona al menos un producto o categoría para poder guardar.
            </p>
          ) : null}
        </FormSection>
      ) : template !== 'order_threshold' ? (
      <>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Aplica a</legend>
        <div className={styles.chipGrid} role="group" aria-label="Alcance de la promoción">
          {(
            template === 'combo'
              ? ([['product', 'Productos del combo']] as const)
              : ([
                  ['product', 'Productos'],
                  ['category', 'Categorías'],
                ] as const)
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                form.scope === value ? `${styles.chip} ${styles.chipActive}` : styles.chip
              }
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  scope: value,
                  productIds: value === 'product' ? prev.productIds : [],
                  categoryIds: value === 'category' ? prev.categoryIds : [],
                  complementOptionItemIds: prev.complementOptionItemIds,
                }))
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {form.scope === 'product' ? (
        <div className={styles.field}>
          <div className={styles.menuPickerHeader}>
            <span className={styles.label}>
              {template === 'combo' ? 'Productos del combo' : 'Productos incluidos'}
            </span>
            {form.productIds.length > 0 ? (
              <span className={styles.menuPickerCount}>
                {form.productIds.length} seleccionado{form.productIds.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          {products.length === 0 ? (
            <p className={styles.helpText}>No hay productos disponibles.</p>
          ) : (
            <>
              <div className={styles.searchField}>
                <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
                <input
                  id="promo-product-search"
                  className={styles.searchInput}
                  type="search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  aria-label="Buscar producto"
                />
              </div>
              {filteredProducts.length === 0 ? (
                <div className={styles.menuPickerEmpty}>
                  <p className={styles.menuPickerEmptyTitle}>Sin coincidencias</p>
                  <p className={styles.helpText}>
                    Prueba con otro término o borra la búsqueda para ver todos los productos.
                  </p>
                </div>
              ) : (
                <div className={styles.checkList} role="list" aria-label="Productos">
                  {filteredProducts.map((product) => (
                    <label key={product.id} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={form.productIds.includes(product.id)}
                        onChange={() =>
                          setForm((prev) => {
                            const productIds = toggleId(prev.productIds, product.id);
                            const next = { ...prev, productIds };
                            return {
                              ...next,
                              complementOptionItemIds: syncComplementsOnSelectionChange(
                                prev,
                                next,
                                products,
                              ),
                            };
                          })
                        }
                      />
                      <span>{product.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {form.scope === 'category' ? (
        <CategoryProductPicker
          categories={categories}
          products={products}
          categoryIds={form.categoryIds}
          productIds={form.productIds}
          helpText="Selecciona categorías completas o expande una para elegir productos específicos."
          onSelectionChange={(categoryIds, productIds) =>
            setForm((prev) => {
              const next = { ...prev, categoryIds, productIds };
              return {
                ...next,
                complementOptionItemIds: syncComplementsOnSelectionChange(prev, next, products),
              };
            })
          }
        />
      ) : null}
      </>
      ) : null}

      {template === 'bundle' && complementProducts.length > 0 ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            Complementos que participan
            {complementCount > 0 ? (
              <span className={styles.legendCount}> ({complementCount})</span>
            ) : null}
          </legend>
          <p className={styles.helpText}>
            Marca los extras que entran al NxM. Solo los complementos seleccionados participan en la
            promoción. Si el cliente elige uno no marcado, la promoción no aplicará y verá un aviso
            en el menú.
          </p>
          <div className={styles.complementList}>
            {complementProducts.map((product) => {
              const activeGroups = product.option_groups.filter(
                (g) => g.is_active && g.items.some((i) => i.is_active),
              );
              if (activeGroups.length === 0) return null;

              return (
                <div key={product.id} className={styles.complementProduct}>
                  <div className={styles.complementProductTitle}>{product.name}</div>
                  {activeGroups.map((group) => {
                    const activeItems = group.items.filter((i) => i.is_active);
                    const groupItemIds = activeItems.map((i) => i.id);
                    const allSelected = groupItemIds.every((id) =>
                      form.complementOptionItemIds.includes(id),
                    );

                    return (
                      <div key={group.id} className={styles.complementGroup}>
                        <div className={styles.complementGroupHeader}>
                          <span className={styles.complementGroupTitle}>{group.title}</span>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                complementOptionItemIds: setGroupComplementsChecked(
                                  prev.complementOptionItemIds,
                                  groupItemIds,
                                  !allSelected,
                                ),
                              }))
                            }
                          >
                            {allSelected ? 'Quitar todos' : 'Todos'}
                          </button>
                        </div>
                        <div className={styles.complementItems}>
                          {activeItems.map((item) => (
                            <label key={item.id} className={styles.checkItem}>
                              <input
                                type="checkbox"
                                checked={form.complementOptionItemIds.includes(item.id)}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    complementOptionItemIds: setComplementChecked(
                                      prev.complementOptionItemIds,
                                      item.id,
                                      e.target.checked,
                                    ),
                                  }))
                                }
                              />
                              <span>
                                {item.label}
                                {item.price_delta_cents > 0
                                  ? ` (+${formatMoney(item.price_delta_cents / 100)})`
                                  : ''}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <SectionShell
        asCard={template === 'product_discount'}
        title="Horario recurrente"
        hint={
          template === 'product_discount'
            ? 'Opcional. Limita la promoción a días u horas específicas.'
            : undefined
        }
      >

        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleLabel}>Repetir en días específicos</span>
            <span className={styles.toggleHint}>
              Si está desactivado, aplica todos los días de la semana.
            </span>
          </span>
          <input
            className={styles.toggleInput}
            type="checkbox"
            checked={form.schedule.useWeekdays}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                schedule: {
                  ...prev.schedule,
                  useWeekdays: e.target.checked,
                  weekdays: e.target.checked ? prev.schedule.weekdays : [],
                },
              }))
            }
          />
        </label>

        {form.schedule.useWeekdays ? (
          <div className={styles.weekdayRow} role="group" aria-label="Días de la semana">
            {WEEKDAY_SHORT.map((short, dayIndex) => {
              const selected = form.schedule.weekdays.includes(dayIndex);
              return (
                <button
                  key={short}
                  type="button"
                  className={
                    selected ? `${styles.weekdayChip} ${styles.weekdayChipActive}` : styles.weekdayChip
                  }
                  aria-pressed={selected}
                  title={WEEKDAY_LABELS[dayIndex]}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      schedule: {
                        ...prev.schedule,
                        weekdays: toggleWeekday(prev.schedule.weekdays, dayIndex),
                      },
                    }))
                  }
                >
                  {short}
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.helpText}>Selecciona los días en los que estará activa.</p>
        )}

        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleLabel}>Limitar horario del día</span>
            <span className={styles.toggleHint}>Por ejemplo, happy hour de 17:00 a 20:00.</span>
          </span>
          <input
            className={styles.toggleInput}
            type="checkbox"
            checked={form.schedule.useTimeWindow}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                schedule: { ...prev.schedule, useTimeWindow: e.target.checked },
              }))
            }
          />
        </label>

        {form.schedule.useTimeWindow ? (
          <div className={styles.grid2}>
            <div>
              <label className={styles.label} htmlFor="schedule-start">
                Desde
              </label>
              <input
                id="schedule-start"
                className={styles.input}
                type="time"
                value={form.schedule.dailyStartTime}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    schedule: { ...prev.schedule, dailyStartTime: e.target.value },
                  }))
                }
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="schedule-end">
                Hasta
              </label>
              <input
                id="schedule-end"
                className={styles.input}
                type="time"
                value={form.schedule.dailyEndTime}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    schedule: { ...prev.schedule, dailyEndTime: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        ) : null}
      </SectionShell>

      <SectionShell
        asCard={template === 'product_discount'}
        title="Vigencia de campaña"
        hint={
          template === 'product_discount'
            ? 'Opcional. Define el periodo en que la promoción puede estar activa.'
            : undefined
        }
      >
        {template === 'product_discount' ? null : (
        <p className={styles.helpText}>
          Opcional. Ajusta cuándo puede estar activa la promoción (independiente de los días u
          horarios de arriba). Si no se especifica, la promoción estará activa siempre.
        </p>
        )}
        <div className={styles.grid2}>
          <div>
            <label className={styles.label} htmlFor="campaign-starts">
              Inicio
            </label>
            <input
              id="campaign-starts"
              className={styles.input}
              type="datetime-local"
              value={form.campaignStartsAt}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, campaignStartsAt: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="campaign-ends">
              Fin
            </label>
            <input
              id="campaign-ends"
              className={styles.input}
              type="datetime-local"
              value={form.campaignEndsAt}
              onChange={(e) => setForm((prev) => ({ ...prev, campaignEndsAt: e.target.value }))}
            />
          </div>
        </div>
      </SectionShell>

        </form>
      </div>

      <footer className={styles.footer}>
        {error ? <div className={styles.footerError}>{error}</div> : null}
        <div className={styles.footerActions}>
          <button
            type="button"
            className={styles.footerSecondaryBtn}
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className={styles.primaryBtn}
            disabled={!canSave || saving}
          >
            {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear promoción'}
          </button>
        </div>
      </footer>
    </div>
  );
}
