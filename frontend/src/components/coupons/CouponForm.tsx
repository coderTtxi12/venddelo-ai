'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { Category, Coupon, Product } from '@/lib/api/types';
import type { CouponInput, CouponScope, CouponType } from '@/lib/api/coupons';
import { CategoryProductPicker } from '@/components/marketing/CategoryProductPicker';
import styles from '../pages/MarketingPage.module.css';

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
  expiresOn: string;
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
    expiresOn: '',
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
    expiresOn: coupon.expires_on ?? '',
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

function validateForm(values: CouponFormValues): string[] {
  const errors: string[] = [];
  const code = values.code.trim();
  if (!CODE_PATTERN.test(code)) {
    errors.push('El código debe tener entre 3 y 32 caracteres (letras, números, guión o guión bajo).');
  }
  if (!values.name.trim()) {
    errors.push('El nombre es obligatorio.');
  }
  if (values.type === 'percent') {
    const percent = Number.parseInt(values.percent, 10);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      errors.push('El porcentaje debe estar entre 1 y 100.');
    }
  } else if (values.type === 'amount') {
    if (parseMoneyToCents(values.amount) == null) {
      errors.push('Indica un monto de descuento válido.');
    }
  }
  if (values.scope === 'category' && values.categoryIds.length === 0) {
    errors.push('Selecciona al menos una categoría.');
  }
  if (values.scope === 'product' && values.productIds.length === 0) {
    errors.push('Selecciona al menos un producto.');
  }
  const stock = parseOptionalInt(values.stockQty);
  if (values.stockQty.trim() && (stock == null || stock < 1)) {
    errors.push('Las existencias deben ser un número entero mayor a 0, o déjalo vacío para ilimitado.');
  }
  return errors;
}

function toPayload(values: CouponFormValues): CouponInput {
  const stockQty = parseOptionalInt(values.stockQty);
  const payload: CouponInput = {
    code: values.code.trim(),
    name: values.name.trim(),
    type: values.type,
    scope: values.scope,
    stock_qty: stockQty,
    expires_on: values.expiresOn.trim() ? values.expiresOn.trim() : null,
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
  const [values, setValues] = useState<CouponFormValues>(initialValues ?? emptyCouponFormValues());
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const summaryError = useMemo(() => {
    if (error) return error;
    if (fieldErrors.length === 0) return null;
    return fieldErrors[0];
  }, [error, fieldErrors]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validateForm(values);
    setFieldErrors(errors);
    if (errors.length > 0) return;
    await onSubmit(toPayload(values));
  };

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {summaryError ? (
        <div className={styles.errorBanner} role="alert">
          {summaryError}
        </div>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>Código</span>
        <input
          className={styles.input}
          value={values.code}
          onChange={(event) => setValues((prev) => ({ ...prev, code: event.target.value }))}
          placeholder="PIZZA20"
          autoComplete="off"
          disabled={saving || mode === 'edit'}
          aria-describedby="coupon-code-help"
          required
        />
        <span id="coupon-code-help" className={styles.helpText}>
          Entre 3 y 32 caracteres. Se guardará en mayúsculas.
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Nombre interno</span>
        <input
          className={styles.input}
          value={values.name}
          onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
          disabled={saving}
          required
        />
      </label>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Tipo de beneficio</legend>
        <div className={styles.segment} role="group" aria-label="Tipo de cupón">
          {(
            [
              ['percent', 'Porcentaje'],
              ['amount', 'Monto fijo'],
              ['free_shipping', 'Envío gratis'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              className={`${styles.segmentBtn} ${values.type === type ? styles.segmentBtnActive : ''}`}
              onClick={() => setValues((prev) => ({ ...prev, type }))}
              disabled={saving}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {values.type === 'percent' ? (
        <label className={styles.field}>
          <span className={styles.label}>Porcentaje</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={100}
            value={values.percent}
            onChange={(event) => setValues((prev) => ({ ...prev, percent: event.target.value }))}
            disabled={saving}
          />
        </label>
      ) : null}

      {values.type === 'amount' ? (
        <label className={styles.field}>
          <span className={styles.label}>Monto de descuento (MXN)</span>
          <input
            className={styles.input}
            inputMode="decimal"
            value={values.amount}
            onChange={(event) => setValues((prev) => ({ ...prev, amount: event.target.value }))}
            disabled={saving}
          />
        </label>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Alcance</legend>
        <div className={styles.segment} role="group" aria-label="Alcance del cupón">
          {(
            [
              ['all', 'Todo el pedido'],
              ['category', 'Categoría(s)'],
              ['product', 'Producto(s)'],
            ] as const
          ).map(([scope, label]) => (
            <button
              key={scope}
              type="button"
              className={`${styles.segmentBtn} ${values.scope === scope ? styles.segmentBtnActive : ''}`}
              onClick={() =>
                setValues((prev) => ({
                  ...prev,
                  scope,
                  categoryIds: scope === 'category' ? prev.categoryIds : [],
                  productIds: scope === 'product' ? prev.productIds : [],
                }))
              }
              disabled={saving}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {values.scope !== 'all' ? (
        <CategoryProductPicker
          categories={categories}
          products={products}
          categoryIds={values.categoryIds}
          productIds={values.productIds}
          onSelectionChange={(categoryIds, productIds) =>
            setValues((prev) => ({ ...prev, categoryIds, productIds }))
          }
          headerLabel={values.scope === 'category' ? 'Categorías' : 'Productos'}
          helpText={
            values.scope === 'category'
              ? 'El descuento aplica solo a productos de las categorías seleccionadas.'
              : 'El descuento aplica solo a los productos seleccionados.'
          }
          searchInputId="coupon-scope-search"
        />
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>Existencias (usos totales)</span>
        <input
          className={styles.input}
          inputMode="numeric"
          value={values.stockQty}
          onChange={(event) => setValues((prev) => ({ ...prev, stockQty: event.target.value }))}
          placeholder="Ilimitado"
          disabled={saving}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Caducidad</span>
        <input
          className={styles.input}
          type="date"
          value={values.expiresOn}
          onChange={(event) => setValues((prev) => ({ ...prev, expiresOn: event.target.value }))}
          disabled={saving}
        />
      </label>

      <label className={styles.checkItem}>
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(event) => setValues((prev) => ({ ...prev, isActive: event.target.checked }))}
          disabled={saving}
        />
        Cupón activo
      </label>

      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear cupón'}
        </button>
      </div>
    </form>
  );
}
