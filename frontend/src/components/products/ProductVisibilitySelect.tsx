'use client';

import {
  getProductVisibilityState,
  PRODUCT_VISIBILITY_OPTIONS,
  productVisibilityMeta,
  type ProductVisibilityState,
} from '@/lib/menu/productVisibility';
import type { ProductDraft } from '@/services/db/supplierCatalogTypes';
import styles from './ProductVisibilitySelect.module.css';

type ProductVisibilitySelectProps = {
  product: ProductDraft;
  disabled?: boolean;
  saving?: boolean;
  className?: string;
  onChange: (state: ProductVisibilityState) => void;
};

export function ProductVisibilitySelect({
  product,
  disabled = false,
  saving = false,
  className,
  onChange,
}: ProductVisibilitySelectProps) {
  const state = getProductVisibilityState(product);
  const meta = productVisibilityMeta(product);

  return (
    <label
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <select
        className={`${styles.select} ${styles[`select_${state}`]} ${saving ? styles.selectSaving : ''}`}
        value={state}
        disabled={disabled || saving}
        aria-label={`Estado del producto: ${meta.label}`}
        title={meta.help}
        onChange={(event) => onChange(event.target.value as ProductVisibilityState)}
      >
        {PRODUCT_VISIBILITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {saving ? <span className={styles.saving} aria-hidden>…</span> : null}
    </label>
  );
}
