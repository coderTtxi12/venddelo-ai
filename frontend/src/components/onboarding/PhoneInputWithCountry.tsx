'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  COUNTRY_DIAL_CODES,
  digitsOnly,
  findCountryByIso,
  type CountryDialCode,
} from '@/lib/phone/countryDialCodes';
import styles from './PhoneInputWithCountry.module.css';
import digitalMenuStyles from './PhoneInputWithCountry.digitalMenu.module.css';

type PhoneInputVariant = 'dashboard' | 'digitalMenu';

type PhoneInputWithCountryProps = {
  countryIso: string;
  localNumber: string;
  onCountryChange: (iso: string) => void;
  onLocalNumberChange: (value: string) => void;
  onLocalNumberBlur?: () => void;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  showSameAsOwner?: boolean;
  onUseSameAsOwner?: () => void;
  variant?: PhoneInputVariant;
  hasError?: boolean;
};

export function PhoneInputWithCountry({
  countryIso,
  localNumber,
  onCountryChange,
  onLocalNumberChange,
  onLocalNumberBlur,
  placeholder = '55 1234 5678',
  hint,
  autoFocus = false,
  showSameAsOwner = false,
  onUseSameAsOwner,
  variant = 'dashboard',
  hasError = false,
}: PhoneInputWithCountryProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = findCountryByIso(countryIso);
  const ui = variant === 'digitalMenu' ? digitalMenuStyles : styles;
  const attentionClass = hasError ? ui.inputNeedsAttention : '';

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const pickCountry = (country: CountryDialCode) => {
    onCountryChange(country.iso);
    setOpen(false);
  };

  return (
    <div className={ui.wrap}>
      <div className={ui.row} ref={wrapRef}>
        <div className={ui.countrySelect}>
          <button
            type="button"
            className={`${ui.countryButton} ${attentionClass}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className={ui.flag} aria-hidden>
              {selected.flag}
            </span>
            <span className={ui.dialCode}>{selected.dialCode}</span>
            <span className={ui.chevron} aria-hidden>
              ▾
            </span>
          </button>

          {open ? (
            <div id={listId} className={ui.dropdown} role="listbox" aria-label="País">
              {COUNTRY_DIAL_CODES.map((country) => (
                <button
                  key={country.iso}
                  type="button"
                  role="option"
                  aria-selected={country.iso === countryIso}
                  className={ui.dropdownItem}
                  onClick={() => pickCountry(country)}
                >
                  <span className={ui.flag} aria-hidden>
                    {country.flag}
                  </span>
                  <span>
                    {country.name} ({country.dialCode})
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className={`${ui.phoneInput} ${attentionClass}`}
          value={localNumber}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Número de teléfono"
          aria-invalid={hasError || undefined}
          onChange={(event) => onLocalNumberChange(digitsOnly(event.target.value))}
          onBlur={onLocalNumberBlur}
        />
      </div>

      {hint ? <p className={ui.hint}>{hint}</p> : null}

      {showSameAsOwner && onUseSameAsOwner ? (
        <button type="button" className={ui.sameNumberBtn} onClick={onUseSameAsOwner}>
          Usar el mismo número del responsable
        </button>
      ) : null}
    </div>
  );
}
