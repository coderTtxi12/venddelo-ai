'use client';

import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';
import {
  CategoryProductPicker,
  hasMenuSelection,
  menuEligibleProducts,
  normalizeCategorySelection,
} from './CategoryProductPicker';
import styles from '../pages/MarketingPage.module.css';

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
  initialValues?: PromotionFormSubmitPayload | null;
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
  initialValues = null,
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
    if (!form.imagePath?.trim()) return false;

    if (form.kind === 'percent' && (form.percent < 1 || form.percent > 100)) return false;
    if (form.kind === 'amount' && form.amount <= 0) return false;
    if (form.kind === 'bundle') {
      if (form.bundle.getQuantity < 2) return false;
      if (form.bundle.payQuantity < 1) return false;
      if (form.bundle.payQuantity >= form.bundle.getQuantity) return false;
    }

    if (form.scope === 'product' && form.productIds.length === 0) return false;
    if (form.scope === 'category' && !hasMenuSelection(form.categoryIds, form.productIds)) {
      return false;
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
  }, [form]);

  const previewLabel = useMemo(() => {
    if (form.kind === 'bundle') return formatBundleLabel(form.bundle);
    if (form.kind === 'percent') return `${form.percent}%`;
    if (form.kind === 'amount') return formatMoney(form.amount);
    return '—';
  }, [form]);

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
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const payload =
          form.scope === 'category'
            ? { ...form, ...normalizeCategorySelection(form.categoryIds, form.productIds, products) }
            : form;
        void onSubmit(payload);
      }}
    >
      <div className={styles.infoBanner} role="status">
        Configura días, horarios, ofertas N×M y complementos. La promoción se aplicará en el menú
        público y en el carrito según la vigencia y el horario del restaurante.
      </div>

      <div className={styles.previewCard}>
        <span className={styles.previewLabel}>Vista previa</span>
        <strong className={styles.previewValue}>{previewLabel}</strong>
        {form.schedule.useWeekdays && form.schedule.weekdays.length > 0 ? (
          <span className={styles.previewMeta}>
            {form.schedule.weekdays.map((d: number) => WEEKDAY_LABELS[d]).join(' · ')}
          </span>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="promo-name">
          Nombre de la promoción
        </label>
        <input
          id="promo-name"
          className={styles.input}
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Ej. Miércoles pizza 2×1, Happy hour bebidas"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="promo-image">
          Imagen promocional <span className={styles.requiredMark}>*</span>
        </label>
        <p className={styles.helpText} id="promo-image-help">
          Banner del acceso directo en el menú público. Muestra los platillos participantes al
          tocarla.
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

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Tipo de descuento</legend>
        <div className={styles.segment} role="group" aria-label="Tipo de descuento">
          {(
            [
              ['bundle', 'NxM (2×1, 3×1…)'],
              ['percent', 'Porcentaje'],
              ['amount', 'Monto fijo'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                form.kind === value ? `${styles.segmentBtn} ${styles.segmentBtnActive}` : styles.segmentBtn
              }
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  kind: value,
                  ...(value === 'bundle' && prev.scope === 'order' ? { scope: 'category' } : {}),
                }))
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {form.kind === 'bundle' ? (
        <div className={styles.field}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>¿Cómo se combinan los productos?</legend>
            <div className={styles.segment} role="radiogroup" aria-label="Modo de emparejamiento N×M">
              {(
                [
                  ['cross_product', 'Cualquier producto'],
                  ['same_product', 'Mismo producto'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={form.bundle.pairingMode === mode}
                  className={
                    form.bundle.pairingMode === mode
                      ? `${styles.segmentBtn} ${styles.segmentBtnActive}`
                      : styles.segmentBtn
                  }
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      bundle: { ...prev.bundle, pairingMode: mode },
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className={styles.helpText}>
              {form.bundle.pairingMode === 'same_product'
                ? 'Ejemplo: 2 hamburguesas del mismo tipo. No mezcla productos distintos en la misma oferta.'
                : 'Ejemplo: 1 hamburguesa + 1 alitas. Pueden ser de categorías distintas.'}
            </p>
          </fieldset>
          <div className={styles.bundleCallout} role="note">
            <p className={styles.bundleCalloutSlogan}>Se cobra el de mayor precio</p>
            <p className={styles.bundleCalloutDetail}>
              {form.bundle.pairingMode === 'same_product' ? (
                <>
                  La oferta aplica solo entre unidades del mismo producto. El carrito compara el precio
                  con descuento de catálogo (si el producto ya lo tiene) y cobra el más caro; el de
                  menor precio sale gratis. Los complementos con costo extra se suman siempre.
                </>
              ) : (
                <>
                  Puedes elegir productos distintos, incluso de diferentes categorías. El carrito
                  compara el precio con descuento de catálogo y cobra el más caro; el de menor precio
                  sale gratis. Los complementos con costo extra se suman siempre, en ambos productos.
                </>
              )}
            </p>
          </div>
          <span className={styles.label}>Oferta N×M</span>
          <p className={styles.helpText}>
            El cliente lleva {form.bundle.getQuantity} y paga {form.bundle.payQuantity}.
          </p>
          <div className={styles.presetRow}>
            {BUNDLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={
                  bundleMatchesPreset(form.bundle, preset)
                    ? `${styles.presetBtn} ${styles.presetBtnActive}`
                    : styles.presetBtn
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

      {form.kind === 'percent' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-percent">
            Porcentaje (%)
          </label>
          <input
            id="promo-percent"
            className={styles.input}
            type="number"
            min={1}
            max={100}
            step={1}
            value={form.percent}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                percent: clampNumber(Math.round(Number(e.target.value)), 1, 100),
              }))
            }
          />
        </div>
      ) : null}

      {form.kind === 'amount' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-amount">
            Monto de descuento (MXN)
          </label>
          <input
            id="promo-amount"
            className={styles.input}
            type="number"
            min={0.01}
            step={0.01}
            value={form.amount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                amount: clampNumber(Number(e.target.value), 0, 1_000_000),
              }))
            }
          />
        </div>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Aplica a</legend>
        <div className={styles.segment} role="group" aria-label="Alcance de la promoción">
          {(
            form.kind === 'bundle'
              ? ([
                  ['product', 'Productos'],
                  ['category', 'Categorías'],
                ] as const)
              : ([
                  ['product', 'Productos'],
                  ['category', 'Categorías'],
                  ['order', 'Pedido'],
                ] as const)
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                form.scope === value ? `${styles.segmentBtn} ${styles.segmentBtnActive}` : styles.segmentBtn
              }
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  scope: value,
                  productIds: value === 'product' ? prev.productIds : [],
                  categoryIds: value === 'category' ? prev.categoryIds : [],
                  complementOptionItemIds: value === 'order' ? [] : prev.complementOptionItemIds,
                }))
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {form.scope === 'order' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="promo-min-order">
            Pedido mínimo (MXN, opcional)
          </label>
          <input
            id="promo-min-order"
            className={styles.input}
            type="number"
            min={0}
            step={0.01}
            value={form.minOrderAmount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                minOrderAmount: clampNumber(Number(e.target.value), 0, 1_000_000),
              }))
            }
          />
          <p className={styles.helpText}>Déjalo en 0 si no hay monto mínimo.</p>
        </div>
      ) : null}

      {form.scope === 'product' ? (
        <div className={styles.field}>
          <div className={styles.menuPickerHeader}>
            <span className={styles.label}>Productos incluidos</span>
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
          helpText={
            form.kind === 'bundle'
              ? 'Selecciona categorías completas o productos sueltos de distintas categorías. En el carrito se agrupan todos para aplicar el N×M.'
              : 'Selecciona categorías completas o expande una para elegir productos específicos.'
          }
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

      {form.scope !== 'order' && complementProducts.length > 0 ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            Complementos que participan
            {complementCount > 0 ? (
              <span className={styles.legendCount}> ({complementCount})</span>
            ) : null}
          </legend>
          <p className={styles.helpText}>
            Se incluyen automáticamente todos los extras de cada producto seleccionado. Si el cliente
            elige en el menú un complemento que no esté marcado aquí, la promoción no aplicará y verá
            un aviso en el menú.
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
                                complementOptionItemIds: allSelected
                                  ? prev.complementOptionItemIds.filter(
                                      (id: string) => !groupItemIds.includes(id),
                                    )
                                  : [
                                      ...new Set([
                                        ...prev.complementOptionItemIds,
                                        ...groupItemIds,
                                      ]),
                                    ],
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
                                onChange={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    complementOptionItemIds: toggleId(
                                      prev.complementOptionItemIds,
                                      item.id,
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

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Horario recurrente</legend>

        <label className={styles.toggleRow}>
          <input
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
          <span>Repetir solo en días específicos</span>
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
          <p className={styles.helpText}>Si está desactivado, aplica todos los días de la semana.</p>
        )}

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={form.schedule.useTimeWindow}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                schedule: { ...prev.schedule, useTimeWindow: e.target.checked },
              }))
            }
          />
          <span>Limitar a un horario del día</span>
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
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Vigencia de campaña</legend>
        <p className={styles.helpText}>
          Opcional. Ajusta cuándo puede estar activa la promoción (independiente de los días u
          horarios de arriba). Si no se especifica, la promoción estará activa siempre.
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
      </fieldset>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSave || saving}>
          {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear promoción'}
        </button>
      </div>
    </form>
  );
}
