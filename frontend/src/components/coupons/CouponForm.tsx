'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Category, Coupon, Product } from '@/lib/api/types';
import type { CouponInput, CouponScope, CouponType } from '@/lib/api/coupons';
import { formatCouponCodeInput } from '@/lib/coupons/code';
import { localDateInputValue } from '@/lib/coupons/dates';
import {
  COUPON_WEEKDAY_SHORT,
  normalizeCouponWeekdays,
  toggleCouponWeekday,
} from '@/lib/coupons/weekdays';
import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';
import {
  couponFieldErrorMessages,
  firstCouponFieldError,
  isCouponCodeConflictMessage,
  scrollToCouponField,
  type CouponFieldErrors,
} from '@/lib/coupons/formErrors';
import { CategoryProductPicker } from '@/components/marketing/CategoryProductPicker';
import styles from './CouponForm.module.css';

export type CouponFormValues = {
  code: string;
  name: string;
  type: CouponType;
  percent: string;
  amount: string;
  scope: CouponScope;
  categoryIds: string[];
  productIds: string[];
  stockQty: string;
  startsOn: string;
  expiresOn: string;
  useWeekdays: boolean;
  weekdays: number[];
  isActive: boolean;
};

type CouponFormProps = {
  categories: Category[];
  products: Product[];
  saving: boolean;
  error: string | null;
  mode?: 'create' | 'edit';
  initialValues?: CouponFormValues | null;
  onCancel: () => void;
  onSubmit: (payload: CouponInput) => Promise<void>;
};

const CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const FORM_ID = 'coupon-form';

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

export function emptyCouponFormValues(): CouponFormValues {
  return {
    code: '',
    name: '',
    type: 'percent',
    percent: '10',
    amount: '',
    scope: 'all',
    categoryIds: [],
    productIds: [],
    stockQty: '',
    startsOn: localDateInputValue(),
    expiresOn: '',
    useWeekdays: false,
    weekdays: [],
    isActive: true,
  };
}

export function couponToFormValues(coupon: Coupon): CouponFormValues {
  return {
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    percent: coupon.percent != null ? String(coupon.percent) : '',
    amount: coupon.amount_cents != null ? String(coupon.amount_cents / 100) : '',
    scope: coupon.scope,
    categoryIds: [...coupon.category_ids],
    productIds: [...coupon.product_ids],
    stockQty: coupon.stock_qty != null ? String(coupon.stock_qty) : '',
    startsOn: coupon.starts_on ?? '',
    expiresOn: coupon.expires_on ?? '',
    useWeekdays: Boolean(coupon.recurrence_weekdays?.length),
    weekdays: [...(coupon.recurrence_weekdays ?? [])],
    isActive: coupon.is_active,
  };
}

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

function parseMoneyToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function validateForm(values: CouponFormValues): CouponFieldErrors {
  const errors: CouponFieldErrors = {};
  const code = formatCouponCodeInput(values.code);
  if (!CODE_PATTERN.test(code)) {
    errors.code =
      'El código debe tener entre 3 y 32 caracteres (letras, números, guión o guión bajo).';
  }
  if (!values.name.trim()) {
    errors.name = 'El nombre es obligatorio.';
  }
  if (values.type === 'percent') {
    const percent = Number.parseInt(values.percent, 10);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      errors.percent = 'El porcentaje debe estar entre 1 y 100.';
    }
  } else if (values.type === 'amount') {
    if (parseMoneyToCents(values.amount) == null) {
      errors.amount = 'Indica un monto de descuento válido.';
    }
  }
  if (values.scope === 'category' && values.categoryIds.length === 0) {
    errors.scope = 'Selecciona al menos una categoría.';
  }
  if (values.scope === 'product' && values.productIds.length === 0) {
    errors.scope = 'Selecciona al menos un producto.';
  }
  const stock = parseOptionalInt(values.stockQty);
  if (values.stockQty.trim() && (stock == null || stock < 1)) {
    errors.stockQty =
      'Las existencias deben ser un número entero mayor a 0, o déjalo vacío para ilimitado.';
  }
  if (values.useWeekdays && values.weekdays.length === 0) {
    errors.weekdays = 'Selecciona al menos un día de la semana.';
  }
  if (values.startsOn.trim() && values.expiresOn.trim() && values.startsOn > values.expiresOn) {
    errors.expiresOn = 'La fecha de caducidad debe ser igual o posterior al inicio.';
  }
  return errors;
}

function toPayload(values: CouponFormValues): CouponInput {
  const stockQty = parseOptionalInt(values.stockQty);
  const payload: CouponInput = {
    code: formatCouponCodeInput(values.code),
    name: values.name.trim(),
    type: values.type,
    scope: values.scope,
    stock_qty: stockQty,
    starts_on: values.startsOn.trim() ? values.startsOn.trim() : null,
    expires_on: values.expiresOn.trim() ? values.expiresOn.trim() : null,
    recurrence_weekdays: values.useWeekdays
      ? normalizeCouponWeekdays(values.weekdays)
      : null,
    is_active: values.isActive,
    product_ids: values.scope === 'product' ? values.productIds : [],
    category_ids: values.scope === 'category' ? values.categoryIds : [],
  };

  if (values.type === 'percent') {
    payload.percent = Number.parseInt(values.percent, 10);
    payload.amount_cents = null;
  } else if (values.type === 'amount') {
    payload.amount_cents = parseMoneyToCents(values.amount);
    payload.percent = null;
  } else {
    payload.percent = null;
    payload.amount_cents = null;
  }

  return payload;
}

export function CouponForm({
  categories,
  products,
  saving,
  error,
  mode = 'create',
  initialValues,
  onCancel,
  onSubmit,
}: CouponFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const codeHelpId = useId();
  const [values, setValues] = useState<CouponFormValues>(initialValues ?? emptyCouponFormValues());
  const [fieldErrors, setFieldErrors] = useState<CouponFieldErrors>({});

  const validationMessages = useMemo(() => couponFieldErrorMessages(fieldErrors), [fieldErrors]);

  const allErrors = useMemo(() => {
    const messages = [...validationMessages];
    if (error && !messages.includes(error)) {
      messages.unshift(error);
    }
    return messages;
  }, [error, validationMessages]);

  useEffect(() => {
    if (!error) return;
    if (isCouponCodeConflictMessage(error)) {
      setFieldErrors((prev) => ({ ...prev, code: error }));
      scrollToCouponField(formRef.current, 'code');
      return;
    }
    footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const clearFieldError = (key: keyof CouponFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validateForm(values);
    setFieldErrors(errors);
    const firstField = firstCouponFieldError(errors);
    if (firstField) {
      scrollToCouponField(formRef.current, firstField);
      footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    await onSubmit(toPayload(values));
  };

  const submitLabel =
    saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear cupón';

  return (
    <div className={styles.shell}>
      <div className={styles.scroll}>
        <form
          ref={formRef}
          id={FORM_ID}
          className={styles.form}
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          <FormSection
            title="Código del cupón"
            hint="Es lo que tus clientes escribirán al pagar en el menú en vivo."
          >
            <label className={styles.field} data-coupon-field="code">
              <span className={styles.label}>
                Código público
              </span>
              <input
                className={`${styles.input} ${styles.codeInput} ${
                  fieldErrors.code ? styles.inputInvalid : ''
                }`}
                value={values.code}
                onChange={(event) => {
                  clearFieldError('code');
                  setValues((prev) => ({
                    ...prev,
                    code: formatCouponCodeInput(event.target.value),
                  }));
                }}
                placeholder="PIZZA20"
                autoComplete="off"
                disabled={saving || mode === 'edit'}
                aria-describedby={fieldErrors.code ? undefined : codeHelpId}
                aria-invalid={fieldErrors.code ? true : undefined}
                required
              />
              {fieldErrors.code ? (
                <p className={styles.fieldError} role="alert">
                  {fieldErrors.code}
                </p>
              ) : (
                <p id={codeHelpId} className={styles.helpText}>
                  Entre 3 y 32 caracteres, sin espacios. Se guarda en mayúsculas.
                </p>
              )}
            </label>

            <label className={styles.field} data-coupon-field="name">
              <span className={styles.label}>
                Nombre interno
              </span>
              <input
                className={`${styles.input} ${fieldErrors.name ? styles.inputInvalid : ''}`}
                value={values.name}
                onChange={(event) => {
                  clearFieldError('name');
                  setValues((prev) => ({ ...prev, name: event.target.value }));
                }}
                placeholder="Ej. Promo fin de semana"
                disabled={saving}
                aria-invalid={fieldErrors.name ? true : undefined}
                required
              />
              {fieldErrors.name ? (
                <p className={styles.fieldError} role="alert">
                  {fieldErrors.name}
                </p>
              ) : (
                <p className={styles.helpText}>Solo para tu equipo; los clientes no lo ven.</p>
              )}
            </label>
          </FormSection>

          <FormSection title="Beneficio" hint="Qué descuento recibe quien use el cupón.">
            <div className={styles.chipGrid} role="group" aria-label="Tipo de beneficio">
              {(
                [
                  ['percent', 'Porcentaje'],
                  ['amount', 'Monto fijo'],
                  ['free_shipping', 'Envío gratis'],
                ] as const
              ).map(([type, label]) => (
                <ChipOption
                  key={type}
                  selected={values.type === type}
                  disabled={saving}
                  onClick={() => setValues((prev) => ({ ...prev, type }))}
                >
                  {label}
                </ChipOption>
              ))}
            </div>

            {values.type === 'percent' ? (
              <label className={styles.field} data-coupon-field="percent">
                <span className={styles.label}>
                  Porcentaje de descuento
                </span>
                <input
                  className={`${styles.input} ${fieldErrors.percent ? styles.inputInvalid : ''}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={values.percent}
                  onChange={(event) => {
                    clearFieldError('percent');
                    setValues((prev) => ({ ...prev, percent: event.target.value }));
                  }}
                  disabled={saving}
                  aria-invalid={fieldErrors.percent ? true : undefined}
                />
                {fieldErrors.percent ? (
                  <p className={styles.fieldError} role="alert">
                    {fieldErrors.percent}
                  </p>
                ) : null}
              </label>
            ) : null}

            {values.type === 'amount' ? (
              <label className={styles.field} data-coupon-field="amount">
                <span className={styles.label}>
                  Monto en pesos (MXN)
                </span>
                <input
                  className={`${styles.input} ${fieldErrors.amount ? styles.inputInvalid : ''}`}
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(event) => {
                    clearFieldError('amount');
                    setValues((prev) => ({ ...prev, amount: event.target.value }));
                  }}
                  placeholder="50"
                  disabled={saving}
                  aria-invalid={fieldErrors.amount ? true : undefined}
                />
                {fieldErrors.amount ? (
                  <p className={styles.fieldError} role="alert">
                    {fieldErrors.amount}
                  </p>
                ) : null}
              </label>
            ) : null}
          </FormSection>

          <FormSection title="Dónde aplica" hint="Elige si el cupón cubre todo el pedido o solo parte del menú.">
            <div className={styles.chipGrid} role="group" aria-label="Alcance del cupón">
              {(
                [
                  ['all', 'Todo el pedido'],
                  ['category', 'Categorías'],
                  ['product', 'Productos'],
                ] as const
              ).map(([scope, label]) => (
                <ChipOption
                  key={scope}
                  selected={values.scope === scope}
                  disabled={saving}
                  onClick={() => {
                    clearFieldError('scope');
                    setValues((prev) => ({
                      ...prev,
                      scope,
                      categoryIds: scope === 'category' ? prev.categoryIds : [],
                      productIds: scope === 'product' ? prev.productIds : [],
                    }));
                  }}
                >
                  {label}
                </ChipOption>
              ))}
            </div>
            {fieldErrors.scope ? (
              <p className={styles.fieldError} role="alert">
                {fieldErrors.scope}
              </p>
            ) : null}

            {values.scope !== 'all' ? (
              <div className={styles.pickerWrap} data-coupon-field="scope">
                <CategoryProductPicker
                  categories={categories}
                  products={products}
                  categoryIds={values.categoryIds}
                  productIds={values.productIds}
                  onSelectionChange={(categoryIds, productIds) => {
                    clearFieldError('scope');
                    setValues((prev) => ({ ...prev, categoryIds, productIds }));
                  }}
                  headerLabel={values.scope === 'category' ? 'Categorías' : 'Productos'}
                  helpText={
                    values.scope === 'category'
                      ? 'El descuento aplica solo a productos de las categorías seleccionadas.'
                      : 'El descuento aplica solo a los productos seleccionados.'
                  }
                  searchInputId="coupon-scope-search"
                />
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Límites y vigencia" hint="Opcional. Controla cuántas veces se puede usar y en qué fechas.">
            <label className={styles.field} data-coupon-field="stockQty">
              <span className={styles.label}>Usos totales</span>
              <input
                className={`${styles.input} ${fieldErrors.stockQty ? styles.inputInvalid : ''}`}
                inputMode="numeric"
                value={values.stockQty}
                onChange={(event) => {
                  clearFieldError('stockQty');
                  setValues((prev) => ({ ...prev, stockQty: event.target.value }));
                }}
                placeholder="Ilimitado"
                disabled={saving}
                aria-invalid={fieldErrors.stockQty ? true : undefined}
              />
              {fieldErrors.stockQty ? (
                <p className={styles.fieldError} role="alert">
                  {fieldErrors.stockQty}
                </p>
              ) : (
                <p className={styles.helpText}>Déjalo vacío si no hay tope de usos.</p>
              )}
            </label>

            <div className={styles.splitRow}>
              <label className={styles.field} data-coupon-field="startsOn">
                <span className={styles.label}>Inicia el</span>
                <input
                  className={`${styles.input} ${fieldErrors.startsOn ? styles.inputInvalid : ''}`}
                  type="date"
                  value={values.startsOn}
                  onChange={(event) => {
                    clearFieldError('startsOn');
                    clearFieldError('expiresOn');
                    setValues((prev) => ({ ...prev, startsOn: event.target.value }));
                  }}
                  disabled={saving}
                  aria-invalid={fieldErrors.startsOn ? true : undefined}
                />
                <p className={styles.helpText}>
                  Por defecto es hoy. El cupón no aplica antes de esta fecha.
                </p>
              </label>

              <label className={styles.field} data-coupon-field="expiresOn">
                <span className={styles.label}>Caduca el</span>
                <input
                  className={`${styles.input} ${fieldErrors.expiresOn ? styles.inputInvalid : ''}`}
                  type="date"
                  value={values.expiresOn}
                  onChange={(event) => {
                    clearFieldError('expiresOn');
                    setValues((prev) => ({ ...prev, expiresOn: event.target.value }));
                  }}
                  disabled={saving}
                  aria-invalid={fieldErrors.expiresOn ? true : undefined}
                />
                {fieldErrors.expiresOn ? (
                  <p className={styles.fieldError} role="alert">
                    {fieldErrors.expiresOn}
                  </p>
                ) : (
                  <p className={styles.helpText}>Sin fecha = sin caducidad.</p>
                )}
              </label>
            </div>

            <div className={styles.scheduleBlock} data-coupon-field="weekdays">
              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <span className={styles.toggleLabel}>Solo ciertos días</span>
                  <span className={styles.toggleHint}>
                    Si lo apagas, el cupón puede usarse cualquier día de la semana.
                  </span>
                </span>
                <input
                  className={styles.toggleInput}
                  type="checkbox"
                  checked={values.useWeekdays}
                  onChange={(event) => {
                    clearFieldError('weekdays');
                    setValues((prev) => ({
                      ...prev,
                      useWeekdays: event.target.checked,
                      weekdays: event.target.checked ? prev.weekdays : [],
                    }));
                  }}
                  disabled={saving}
                />
              </label>

              {values.useWeekdays ? (
                <>
                  <div className={styles.weekdayRow} role="group" aria-label="Días de la semana">
                    {COUPON_WEEKDAY_SHORT.map((short, dayIndex) => {
                      const selected = values.weekdays.includes(dayIndex);
                      return (
                        <button
                          key={short}
                          type="button"
                          className={`${styles.weekdayChip} ${selected ? styles.weekdayChipActive : ''}`}
                          aria-pressed={selected}
                          title={WEEKDAY_LABELS[dayIndex]}
                          disabled={saving}
                          onClick={() => {
                            clearFieldError('weekdays');
                            setValues((prev) => ({
                              ...prev,
                              weekdays: toggleCouponWeekday(prev.weekdays, dayIndex),
                            }));
                          }}
                        >
                          {short}
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.weekdays ? (
                    <p className={styles.fieldError} role="alert">
                      {fieldErrors.weekdays}
                    </p>
                  ) : (
                    <p className={styles.helpText}>
                      Toca las letras para elegir los días. Ejemplo: L + X + V = lunes, miércoles y
                      viernes.
                    </p>
                  )}
                </>
              ) : null}
            </div>

            <label className={styles.toggleRow}>
              <span className={styles.toggleCopy}>
                <span className={styles.toggleLabel}>Cupón activo</span>
                <span className={styles.toggleHint}>
                  Si lo apagas, el código deja de funcionar en el menú.
                </span>
              </span>
              <input
                className={styles.toggleInput}
                type="checkbox"
                checked={values.isActive}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, isActive: event.target.checked }))
                }
                disabled={saving}
              />
            </label>
          </FormSection>
        </form>
      </div>

      <footer ref={footerRef} className={styles.footer}>
        {allErrors.length > 0 ? (
          <div className={styles.footerError} data-form-error-summary role="alert">
            <p className={styles.footerErrorTitle}>
              {allErrors.length === 1 ? 'Falta un detalle:' : 'Revisa estos detalles:'}
            </p>
            <ul className={styles.footerErrorList}>
              {allErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className={styles.footerActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className={styles.primaryBtn} disabled={saving}>
            {submitLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
