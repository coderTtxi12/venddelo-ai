'use client';

import styles from '@/components/pages/ProductsPage.module.css';
import { addLocalDays, calendarDaysBetween, todayIsoDate } from '@/components/products/productInventory';

const SHELF_PRESETS = [1, 2, 7] as const;

export function ProductInventoryControls({
  inventoryQty,
  shelfLifeDays,
  expiresOn,
  onInventoryQtyChange,
  onShelfLifeDaysChange,
  onExpiresOnChange,
}: {
  inventoryQty: string;
  shelfLifeDays: number | null;
  expiresOn: string;
  onInventoryQtyChange: (value: string) => void;
  onShelfLifeDaysChange: (value: number | null) => void;
  onExpiresOnChange: (value: string) => void;
}) {
  const todayIso = todayIsoDate();
  const daysUntil = expiresOn ? calendarDaysBetween(todayIso, expiresOn) : null;
  const expiryMode = expiresOn
    ? daysUntil === 0
      ? 'today'
      : daysUntil != null && (SHELF_PRESETS as readonly number[]).includes(daysUntil)
        ? 'days'
        : 'date'
    : shelfLifeDays != null
      ? 'days'
      : 'none';

  return (
    <fieldset className={styles.inventoryFieldset}>
      <legend className={styles.inventoryLegend}>Inventario (opcional)</legend>
      <p className={styles.helpText} id="inventory-qty-hint">
        Vacío = no se trackea stock.
      </p>

      <div className={styles.inventoryFormGrid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="product-inventory-qty">
            Piezas
          </label>
          <input
            id="product-inventory-qty"
            className={styles.input}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={inventoryQty}
            aria-describedby="inventory-qty-hint"
            onChange={(event) => onInventoryQtyChange(event.target.value)}
            placeholder="Sin inventario"
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label} id="product-expiry-label">
            Caducidad
          </span>
          <div className={styles.inventoryExpiryTabs} role="group" aria-labelledby="product-expiry-label">
            <button
              type="button"
              className={`${styles.inventoryExpiryTab} ${expiryMode === 'none' ? styles.inventoryExpiryTabActive : ''}`}
              aria-pressed={expiryMode === 'none'}
              onClick={() => {
                onShelfLifeDaysChange(null);
                onExpiresOnChange('');
              }}
            >
              Sin caducidad
            </button>
            <button
              type="button"
              className={`${styles.inventoryExpiryTab} ${expiryMode === 'today' ? styles.inventoryExpiryTabActive : ''}`}
              aria-pressed={expiryMode === 'today'}
              onClick={() => {
                onShelfLifeDaysChange(null);
                onExpiresOnChange(todayIso);
              }}
            >
              Hoy
            </button>
            {SHELF_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                className={`${styles.inventoryExpiryTab} ${
                  expiryMode === 'days' &&
                  (daysUntil === days || (expiresOn === '' && shelfLifeDays === days))
                    ? styles.inventoryExpiryTabActive
                    : ''
                }`}
                aria-pressed={
                  expiryMode === 'days' &&
                  (daysUntil === days || (expiresOn === '' && shelfLifeDays === days))
                }
                onClick={() => {
                  onShelfLifeDaysChange(null);
                  onExpiresOnChange(addLocalDays(todayIso, days));
                }}
              >
                {days === 1 ? '1 día' : days === 7 ? '1 semana' : `${days} días`}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.inventoryExpiryTab} ${expiryMode === 'date' ? styles.inventoryExpiryTabActive : ''}`}
              aria-pressed={expiryMode === 'date'}
              onClick={() => {
                onShelfLifeDaysChange(null);
                if (!expiresOn) onExpiresOnChange(todayIso);
              }}
            >
              Fecha…
            </button>
          </div>
          {expiryMode === 'date' ? (
            <label className={styles.inventoryDateField} htmlFor="product-expires-on">
              <span className={styles.label}>Vence el</span>
              <input
                id="product-expires-on"
                className={styles.input}
                type="date"
                value={expiresOn}
                onChange={(event) => {
                  onExpiresOnChange(event.target.value);
                  onShelfLifeDaysChange(null);
                }}
              />
            </label>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
