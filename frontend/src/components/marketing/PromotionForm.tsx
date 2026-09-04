'use client';

import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useMemo, useRef, useState, type ReactNode } from 'react';
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

function formatPreviewDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPreviewTime(value: string): string {
  return value.trim().slice(0, 5);
}

/** Digits only; empty allowed while typing; capped at 100. */
function sanitizePercentTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 3);
  if (digits === '') return '';
  const n = Number(digits);
  if (n > 100) return '100';
  return digits;
}

/** Non-negative decimal money; empty allowed while typing. */
function sanitizeAmountTyping(raw: string): string {
  let cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot !== -1) {
    cleaned =
      cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  if (cleaned.startsWith('.')) cleaned = `0${cleaned}`;
  return cleaned.slice(0, 10);
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
  const [productSearch, setProductSearch] = useState('');
  const [percentInput, setPercentInput] = useState(() =>
    String((initialValues ?? createEmptyPromotionDraft()).percent),
  );
  const [amountInput, setAmountInput] = useState(() => {
    const amount = (initialValues ?? createEmptyPromotionDraft()).amount;
    return amount > 0 ? String(amount) : '';
  });

  const [minOrderInput, setMinOrderInput] = useState(() => {
    const amount = (initialValues ?? createEmptyPromotionDraft()).minOrderAmount;
    return amount > 0 ? String(amount) : '';
  });

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
    if (template === 'bundle' || template === 'combo' || form.scope === 'product') {
      return products.filter((p) => form.productIds.includes(p.id));
    }
    return menuEligibleProducts(products, form.categoryIds, form.productIds);
  }, [products, form.scope, form.productIds, form.categoryIds, template]);

  const complementCount = form.complementOptionItemIds.length;

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.showBanner && !form.imagePath?.trim()) return false;

    if (template === 'bundle') {
      if (form.bundle.getQuantity < 2) return false;
      if (form.bundle.payQuantity < 1) return false;
      if (form.bundle.payQuantity >= form.bundle.getQuantity) return false;
      if (form.productIds.length === 0) return false;
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

  const hasMenuScope = useMemo(() => {
    if (template === 'order_threshold') return true;
    if (template === 'combo') return form.productIds.length >= 2;
    if (template === 'bundle') return form.productIds.length > 0;
    return hasMenuSelection(form.categoryIds, form.productIds);
  }, [form.categoryIds, form.productIds, template]);

  const previewMenuItems = useMemo(() => {
    if (template === 'order_threshold') {
      return { categoryNames: [] as string[], productNames: [] as string[] };
    }
    // NxM and combo are product-only in the editor.
    const includeCategories = template === 'product_discount';
    const categoryNames = includeCategories
      ? categories
          .filter((category) => form.categoryIds.includes(category.id))
          .map((category) => category.name)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      : [];
    const productNames = products
      .filter((product) => form.productIds.includes(product.id))
      .map((product) => product.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return { categoryNames, productNames };
  }, [categories, form.categoryIds, form.productIds, products, template]);

  const liveSchedule = useMemo(() => {
    let days: string;
    let daysDefault: boolean;
    if (form.schedule.useWeekdays) {
      if (form.schedule.weekdays.length > 0) {
        days = form.schedule.weekdays
          .map((day) => WEEKDAY_SHORT[day] ?? WEEKDAY_LABELS[day])
          .join(' · ');
        daysDefault = false;
      } else {
        days = 'Elige al menos un día';
        daysDefault = true;
      }
    } else {
      days = 'Todos los días';
      daysDefault = true;
    }

    let time: string;
    let timeDefault: boolean;
    if (form.schedule.useTimeWindow) {
      if (form.schedule.dailyStartTime && form.schedule.dailyEndTime) {
        time = `${formatPreviewTime(form.schedule.dailyStartTime)}–${formatPreviewTime(form.schedule.dailyEndTime)}`;
        timeDefault = false;
      } else {
        time = 'Define hora de inicio y fin';
        timeDefault = true;
      }
    } else {
      time = 'Todo el día';
      timeDefault = true;
    }

    return { days, time, daysDefault, timeDefault };
  }, [form.schedule]);

  const liveCampaign = useMemo(() => {
    const starts = formatPreviewDateTime(form.campaignStartsAt);
    const ends = formatPreviewDateTime(form.campaignEndsAt);
    if (!starts && !ends) {
      return { text: 'Desde ahora · sin fecha de fin', isDefault: true };
    }
    if (starts && ends) return { text: `${starts} → ${ends}`, isDefault: false };
    if (starts) return { text: `Desde ${starts}`, isDefault: false };
    return { text: `Hasta ${ends}`, isDefault: false };
  }, [form.campaignEndsAt, form.campaignStartsAt]);

  const liveBadge = useMemo(() => {
    if (template === 'bundle') return formatBundleLabel(form.bundle);
    if (form.kind === 'free_shipping') {
      return template === 'combo' ? 'Combo · Envío gratis' : 'Envío gratis';
    }
    if (form.kind === 'amount') {
      return amountInput.trim() ? formatMoney(Number(amountInput) || 0) : '—';
    }
    return percentInput.trim() ? `${percentInput}%` : '—';
  }, [amountInput, form.bundle, form.kind, percentInput, template]);

  const liveBenefit = useMemo(() => {
    if (template === 'bundle') {
      return `Lleva ${form.bundle.getQuantity} y paga ${form.bundle.payQuantity} (mismo producto)`;
    }
    if (template === 'order_threshold') {
      const minLabel = minOrderInput.trim()
        ? `desde ${formatMoney(Number(minOrderInput) || 0)}`
        : 'define el mínimo del carrito';
      if (form.kind === 'free_shipping') return `Envío gratis ${minLabel}`;
      if (form.kind === 'amount') {
        return amountInput.trim()
          ? `${formatMoney(Number(amountInput) || 0)} de descuento ${minLabel}`
          : `Define el monto · ${minLabel}`;
      }
      return percentInput.trim()
        ? `${percentInput}% de descuento ${minLabel}`
        : `Define el porcentaje · ${minLabel}`;
    }
    if (template === 'combo') {
      if (form.kind === 'free_shipping') return 'Envío gratis al llevar todo el combo';
      if (form.kind === 'amount') {
        return amountInput.trim()
          ? `${formatMoney(Number(amountInput) || 0)} al llevar todos los productos`
          : 'Define el monto del combo';
      }
      return percentInput.trim()
        ? `${percentInput}% al llevar todos los productos`
        : 'Define el porcentaje del combo';
    }
    if (form.kind === 'amount') {
      return amountInput.trim()
        ? `${formatMoney(Number(amountInput) || 0)} en cada producto`
        : 'Define el monto de descuento';
    }
    return percentInput.trim()
      ? `${percentInput}% en cada producto`
      : 'Define el porcentaje de descuento';
  }, [amountInput, form.bundle, form.kind, minOrderInput, percentInput, template]);

  const liveScopeEmpty = useMemo(() => {
    if (template === 'order_threshold') return null;
    if (template === 'combo') {
      if (form.productIds.length === 0) return 'Elige al menos 2 productos del combo.';
      if (form.productIds.length === 1) return 'Agrega un producto más para completar el combo.';
      return null;
    }
    if (template === 'bundle') {
      if (form.productIds.length === 0) return 'Elige al menos un producto.';
      return null;
    }
    if (!hasMenuScope) return 'Elige productos o categorías abajo.';
    return null;
  }, [form.productIds.length, hasMenuScope, template]);

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
      <div className={styles.previewDock}>
        <div
          className={
            liveScopeEmpty
              ? `${styles.livePreview} ${styles.livePreviewAttention}`
              : styles.livePreview
          }
          aria-live="polite"
        >
          <div className={styles.livePreviewEyebrow}>
            <span className={styles.livePreviewEyebrowLabel}>Vista previa</span>
            <span className={styles.livePreviewBadge}>{liveBadge}</span>
          </div>

          <p className={styles.livePreviewTitle}>
            {form.name.trim() || 'Sin nombre todavía'}
          </p>

          <p className={styles.livePreviewBenefit}>{liveBenefit}</p>

          {template === 'order_threshold' ? (
            <p className={styles.livePreviewNote}>Aplica al pedido completo al superar el mínimo.</p>
          ) : liveScopeEmpty ? (
            <p className={styles.livePreviewEmpty}>{liveScopeEmpty}</p>
          ) : (
            <div className={styles.livePreviewChips}>
              {previewMenuItems.categoryNames.map((name) => (
                <span key={`cat-${name}`} className={styles.livePreviewChip}>
                  {name}
                </span>
              ))}
              {previewMenuItems.productNames.slice(0, 4).map((name) => (
                <span key={`prod-${name}`} className={styles.livePreviewChip}>
                  {name}
                </span>
              ))}
              {previewMenuItems.productNames.length > 4 ? (
                <span className={`${styles.livePreviewChip} ${styles.livePreviewChipMuted}`}>
                  +{previewMenuItems.productNames.length - 4} más
                </span>
              ) : null}
            </div>
          )}

          <div className={styles.livePreviewMetaList}>
            <p
              className={
                liveSchedule.daysDefault
                  ? `${styles.livePreviewMetaLine} ${styles.livePreviewMetaLineMuted}`
                  : styles.livePreviewMetaLine
              }
            >
              <span className={styles.livePreviewMetaKey}>Días</span>
              {liveSchedule.days}
            </p>
            <p
              className={
                liveSchedule.timeDefault
                  ? `${styles.livePreviewMetaLine} ${styles.livePreviewMetaLineMuted}`
                  : styles.livePreviewMetaLine
              }
            >
              <span className={styles.livePreviewMetaKey}>Horario</span>
              {liveSchedule.time}
            </p>
            <p
              className={
                liveCampaign.isDefault
                  ? `${styles.livePreviewMetaLine} ${styles.livePreviewMetaLineMuted}`
                  : styles.livePreviewMetaLine
              }
            >
              <span className={styles.livePreviewMetaKey}>Vigencia</span>
              {liveCampaign.text}
            </p>
          </div>

          {template !== 'order_threshold' && !form.showBanner ? (
            <p className={styles.livePreviewNote}>Sin banner en el menú</p>
          ) : null}
        </div>
      </div>

      <div className={`${styles.scroll} ${styles.scrollWithDock}`}>
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
                  showBanner: false,
                  imagePath: null,
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
                    scope: 'product' as const,
                    categoryIds: [],
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

      <FormSection
        title="Identidad"
        hint={
          template === 'order_threshold'
            ? 'Nombre interno de la promoción. No se muestra banner en el menú.'
            : 'Nombre e imagen del banner que verán tus clientes en el menú.'
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
              : template === 'bundle'
                ? 'Ej. Miércoles pizza 2×1, Happy hour bebidas'
                : template === 'combo'
                  ? 'Ej. Combo hamburguesa + refresco'
                  : 'Ej. Envío gratis desde $300'
          }
        />
      </div>

      {template !== 'order_threshold' ? (
      <div className={styles.field}>
        <label className={styles.label} htmlFor="promo-image">
          Imagen promocional
        </label>
        <p className={styles.helpText} id="promo-image-help">
          {form.showBanner
            ? 'Formato banner (16:9), como el acceso directo del menú público. Necesaria si el banner está activado.'
            : 'Opcional mientras el banner esté desactivado.'}
        </p>
        <div className={styles.promoBannerUpload}>
          <div
            className={
              promoImageUrl
                ? `${styles.promoBannerFrame} ${styles.promoBannerFrameFilled}`
                : styles.promoBannerFrame
            }
          >
            {promoImageUrl ? (
              <img src={promoImageUrl} alt="" className={styles.promoBannerFrameImg} />
            ) : (
              <div className={styles.promoBannerFrameEmpty} aria-hidden>
                <span className={styles.promoBannerFrameTitle}>Vista tipo banner</span>
                <span className={styles.promoBannerFrameHint}>
                  Mismo tamaño que en el menú del cliente (~16:9).
                </span>
              </div>
            )}
          </div>
          <div className={styles.promoBannerActions}>
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
          </div>
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
        {imageError ? (
          <p className={styles.errorBanner} role="alert">
            {imageError}
          </p>
        ) : null}
      </div>
      ) : null}

      {template !== 'order_threshold' ? (
        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleLabel}>Banner en menú digital</span>
            <span className={styles.toggleHint}>
              Desactivado = solo aplica el beneficio. Activado = también muestra acceso directo.
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
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={percentInput}
                  disabled={saving}
                  placeholder="20"
                  onChange={(e) => {
                    const next = sanitizePercentTyping(e.target.value);
                    setPercentInput(next);
                    setForm((prev) => ({
                      ...prev,
                      percent: next === '' ? 0 : Number(next),
                    }));
                  }}
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
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="50"
                value={amountInput}
                disabled={saving}
                onChange={(e) => {
                  const next = sanitizeAmountTyping(e.target.value);
                  setAmountInput(next);
                  const parsed = Number(next);
                  setForm((prev) => ({
                    ...prev,
                    amount: next === '' || Number.isNaN(parsed) ? 0 : parsed,
                  }));
                }}
              />
              <p className={styles.helpText}>Se resta del precio de cada producto incluido.</p>
            </label>
          )}
        </FormSection>
      ) : null}

      {template === 'combo' ? (
        <FormSection
          title="Beneficio del combo"
          hint="Se aplica solo cuando el carrito incluye todos los productos del combo."
        >
          <div className={`${styles.chipGrid} ${styles.chipGridThree}`} role="group" aria-label="Beneficio">
            {(['percent', 'amount', 'free_shipping'] as const).map((kind) => (
              <ChipOption
                key={kind}
                selected={form.kind === kind}
                disabled={saving}
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
              >
                {kind === 'percent' ? 'Porcentaje' : kind === 'amount' ? 'Monto fijo' : 'Envío gratis'}
              </ChipOption>
            ))}
          </div>
          {form.kind === 'percent' ? (
            <label className={styles.field} htmlFor="combo-percent">
              <span className={styles.label}>Porcentaje de descuento</span>
              <div className={styles.inputWithSuffix}>
                <input
                  id="combo-percent"
                  className={`${styles.input} ${styles.inputSuffixField}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={percentInput}
                  disabled={saving}
                  placeholder="10"
                  onChange={(e) => {
                    const next = sanitizePercentTyping(e.target.value);
                    setPercentInput(next);
                    setForm((prev) => ({
                      ...prev,
                      percent: next === '' ? 0 : Number(next),
                    }));
                  }}
                />
                <span className={styles.inputSuffix} aria-hidden>
                  %
                </span>
              </div>
              <p className={styles.helpText}>Entre 1% y 100%.</p>
            </label>
          ) : null}
          {form.kind === 'amount' ? (
            <label className={styles.field} htmlFor="combo-amount">
              <span className={styles.label}>Monto en pesos (MXN)</span>
              <input
                id="combo-amount"
                className={styles.input}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="50"
                value={amountInput}
                disabled={saving}
                onChange={(e) => {
                  const next = sanitizeAmountTyping(e.target.value);
                  setAmountInput(next);
                  const parsed = Number(next);
                  setForm((prev) => ({
                    ...prev,
                    amount: next === '' || Number.isNaN(parsed) ? 0 : parsed,
                  }));
                }}
              />
            </label>
          ) : null}
          {form.kind === 'free_shipping' ? (
            <p className={styles.helpText}>
              El envío queda en $0 cuando el cliente arma el combo completo.
            </p>
          ) : null}
        </FormSection>
      ) : null}

      {template === 'order_threshold' ? (
        <FormSection
          title="Beneficio al superar el mínimo"
          hint="El carrito debe alcanzar el monto mínimo para aplicar el beneficio."
        >
          <div className={`${styles.chipGrid} ${styles.chipGridThree}`} role="group" aria-label="Beneficio">
            {(['percent', 'amount', 'free_shipping'] as const).map((kind) => (
              <ChipOption
                key={kind}
                selected={form.kind === kind}
                disabled={saving}
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
              >
                {kind === 'percent' ? 'Porcentaje' : kind === 'amount' ? 'Monto fijo' : 'Envío gratis'}
              </ChipOption>
            ))}
          </div>
          {form.kind === 'percent' ? (
            <label className={styles.field} htmlFor="threshold-percent">
              <span className={styles.label}>Porcentaje de descuento</span>
              <div className={styles.inputWithSuffix}>
                <input
                  id="threshold-percent"
                  className={`${styles.input} ${styles.inputSuffixField}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={percentInput}
                  disabled={saving}
                  placeholder="10"
                  onChange={(e) => {
                    const next = sanitizePercentTyping(e.target.value);
                    setPercentInput(next);
                    setForm((prev) => ({
                      ...prev,
                      percent: next === '' ? 0 : Number(next),
                    }));
                  }}
                />
                <span className={styles.inputSuffix} aria-hidden>
                  %
                </span>
              </div>
            </label>
          ) : null}
          {form.kind === 'amount' ? (
            <label className={styles.field} htmlFor="threshold-amount">
              <span className={styles.label}>Descuento en pesos (MXN)</span>
              <input
                id="threshold-amount"
                className={styles.input}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="50"
                value={amountInput}
                disabled={saving}
                onChange={(e) => {
                  const next = sanitizeAmountTyping(e.target.value);
                  setAmountInput(next);
                  const parsed = Number(next);
                  setForm((prev) => ({
                    ...prev,
                    amount: next === '' || Number.isNaN(parsed) ? 0 : parsed,
                  }));
                }}
              />
            </label>
          ) : null}
          <label className={styles.field} htmlFor="promo-min-order">
            <span className={styles.label}>Monto mínimo del carrito</span>
            <input
              id="promo-min-order"
              className={styles.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="300"
              value={minOrderInput}
              disabled={saving}
              onChange={(e) => {
                const next = sanitizeAmountTyping(e.target.value);
                setMinOrderInput(next);
                const parsed = Number(next);
                setForm((prev) => ({
                  ...prev,
                  minOrderAmount: next === '' || Number.isNaN(parsed) ? 0 : parsed,
                }));
              }}
            />
            <p className={styles.helpText}>Debe ser mayor a 0.</p>
          </label>
        </FormSection>
      ) : null}

      {template === 'bundle' ? (
        <FormSection
          title="Oferta N×M"
          hint="Aplica entre unidades del mismo producto. Se cobra el de mayor precio."
        >
          <div className={styles.bundleCallout} role="note">
            <p className={styles.bundleCalloutSlogan}>Se cobra el de mayor precio</p>
            <p className={styles.bundleCalloutDetail}>
              La oferta no mezcla productos distintos. El carrito cobra el más caro; el de menor
              precio sale gratis. Los complementos con costo extra se suman siempre.
            </p>
          </div>
          <p className={styles.helpText}>
            El cliente lleva {form.bundle.getQuantity} y paga {form.bundle.payQuantity}.
          </p>
          <div className={styles.chipGrid} role="group" aria-label="Presets N×M">
            {BUNDLE_PRESETS.map((preset) => (
              <ChipOption
                key={preset.label}
                selected={bundleMatchesPreset(form.bundle, preset)}
                disabled={saving}
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
              </ChipOption>
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
                inputMode="numeric"
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
                inputMode="numeric"
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
        </FormSection>
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

          {!hasMenuScope ? (
            <p className={styles.scopeHint} role="status">
              Selecciona al menos un producto o categoría para poder guardar.
            </p>
          ) : null}
        </FormSection>
      ) : template !== 'order_threshold' ? (
      <FormSection
        title={template === 'combo' ? 'Productos del combo' : 'Productos incluidos'}
        hint={
          template === 'combo'
            ? 'Elige al menos 2 productos. El beneficio aplica solo si están todos en el carrito.'
            : 'La oferta N×M aplica solo entre unidades del mismo producto seleccionado.'
        }
      >
      {form.scope === 'product' || template === 'bundle' || template === 'combo' ? (
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
                            const next = {
                              ...prev,
                              scope: 'product' as const,
                              categoryIds: [],
                              productIds,
                            };
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
          {liveScopeEmpty ? (
            <p className={styles.scopeHint} role="status">
              {liveScopeEmpty}
            </p>
          ) : null}
        </div>
      ) : null}
      </FormSection>
      ) : null}

      {template === 'bundle' && complementProducts.length > 0 ? (
        <FormSection
          title={`Complementos que participan${complementCount > 0 ? ` (${complementCount})` : ''}`}
          hint="Solo los extras marcados entran al N×M. Si el cliente elige uno no marcado, la promo no aplica."
        >
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
        </FormSection>
      ) : null}

      <SectionShell
        asCard
        title="Horario recurrente"
        hint="Opcional. Si no limitas nada, la promo aplica todos los días y a cualquier hora."
      >

        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleLabel}>Repetir en días específicos</span>
            <span className={styles.toggleHint}>
              Desactivado = todos los días. Activado = solo los días que marques.
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
          <p className={styles.helpText}>
            Sin días marcados: la promoción puede aplicar de lunes a domingo.
          </p>
        )}

        <label className={styles.toggleRow}>
          <span className={styles.toggleCopy}>
            <span className={styles.toggleLabel}>Limitar horario del día</span>
            <span className={styles.toggleHint}>
              Desactivado = todo el día. Activado = solo entre las horas que indiques.
            </span>
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
        ) : (
          <p className={styles.helpText}>
            Sin horario: aplica a cualquier hora del día (dentro de los días activos).
          </p>
        )}
      </SectionShell>

      <SectionShell
        asCard
        title="Vigencia de campaña"
        hint="Opcional. Sin fechas = activa desde ahora y sin fecha de fin."
      >
        <p className={styles.helpText}>
          Vacío = empieza a aplicar ahora mismo y sigue vigente hasta que la desactives o borres.
          Puedes poner solo inicio, solo fin, o ambos.
        </p>
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
