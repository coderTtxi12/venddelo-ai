'use client';

import { useEffect, useMemo } from 'react';
import {
  cashDenominationChangeCents,
  formatCashDenominationLabel,
  isCashDenominationValid,
  parseCashDenominationInput,
  suggestedCashDenominations,
} from '@/lib/digital-menu/checkout/cashDenomination';
import type { CheckoutFulfillment } from '@/lib/digital-menu/checkout/fulfillment';
import { formatMoney } from '@/lib/currency';
import styles from './CheckoutCashDenominationSection.module.css';

type CheckoutCashDenominationSectionProps = {
  fulfillment: CheckoutFulfillment;
  orderTotalCents: number;
  currency: string;
  onChange: (cashDenominationCents: number | null) => void;
  showValidation?: boolean;
  variant?: 'inline' | 'sidebar';
  idSuffix?: string;
};

export function CheckoutCashDenominationSection({
  fulfillment,
  orderTotalCents,
  currency,
  onChange,
  showValidation = false,
  variant = 'inline',
  idSuffix = 'main',
}: CheckoutCashDenominationSectionProps) {
  const headingId = `checkout-cash-denomination-heading-${idSuffix}`;
  const customInputId = `checkout-cash-denomination-custom-${idSuffix}`;

  const denominationOptions = useMemo(
    () => suggestedCashDenominations(orderTotalCents),
    [orderTotalCents],
  );

  const customDenominationInput = useMemo(() => {
    const cents = fulfillment.cashDenominationCents;
    if (cents == null) return '';
    if (denominationOptions.includes(cents)) return '';
    return String(cents / 100);
  }, [fulfillment.cashDenominationCents, denominationOptions]);

  const isValid = isCashDenominationValid(fulfillment.cashDenominationCents, orderTotalCents);
  const showError = showValidation && !isValid;

  const changeCents =
    fulfillment.cashDenominationCents != null
      ? cashDenominationChangeCents(fulfillment.cashDenominationCents, orderTotalCents)
      : null;

  useEffect(() => {
    if (
      fulfillment.cashDenominationCents != null &&
      !isCashDenominationValid(fulfillment.cashDenominationCents, orderTotalCents)
    ) {
      onChange(null);
    }
    // Clear stale denomination when order total changes (e.g. delivery fee).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTotalCents]);

  const validationMessage = `Indica con qué billete pagarás (mínimo ${formatMoney(orderTotalCents / 100, currency)})`;

  const blockClass =
    variant === 'sidebar'
      ? `${styles.block} ${styles.blockSidebar} ${showError ? styles.blockNeedsAttention : ''}`
      : `${styles.block} ${styles.blockInline} ${showError ? styles.blockNeedsAttention : ''}`;

  return (
    <section
      className={blockClass}
      data-cash-denomination-section=""
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={styles.title}>
        ¿Con qué billete pagarás?
      </h2>
      <p className={styles.hint}>
        {variant === 'sidebar' ? (
          <>
            Esto le ayudará al repartidor a llevar el cambio para tu total de{' '}
            <strong>{formatMoney(orderTotalCents / 100, currency)}</strong>.
          </>
        ) : (
          <>
            Esto le ayudará al repartidor a llevar el cambio para tu total de:{' '}
            <strong>{formatMoney(orderTotalCents / 100, currency)}</strong>
          </>
        )}
      </p>

      {denominationOptions.length > 0 ? (
        <div
          className={variant === 'sidebar' ? styles.gridSidebar : styles.grid}
          role="radiogroup"
          aria-labelledby={headingId}
        >
          {denominationOptions.map((cents) => {
            const selected = fulfillment.cashDenominationCents === cents;
            return (
              <button
                key={cents}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                onClick={() => onChange(cents)}
              >
                {formatCashDenominationLabel(cents)}
              </button>
            );
          })}
        </div>
      ) : null}

      <label className={styles.customField} htmlFor={customInputId}>
        <span className={styles.customLabel}>Otro monto (MXN)</span>
        <div className={styles.inputWrap}>
          <span className={styles.currency} aria-hidden>
            $
          </span>
          <input
            id={customInputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={`${styles.input} ${showError ? styles.inputNeedsAttention : ''}`}
            placeholder="Ej. 350"
            value={customDenominationInput}
            onChange={(event) => onChange(parseCashDenominationInput(event.target.value))}
            aria-invalid={showError}
          />
        </div>
      </label>

      {changeCents != null && changeCents > 0 ? (
        <p className={styles.changeHint} role="status">
          Cambio aproximado: {formatMoney(changeCents / 100, currency)}
        </p>
      ) : null}

      {showError ? (
        <p className={styles.error} role="alert">
          {validationMessage}
        </p>
      ) : null}
    </section>
  );
}
