'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  COUNTRY_DIAL_CODES,
  digitsOnly,
  findCountryByIso,
  type CountryDialCode,
} from '@/lib/phone/countryDialCodes';
import styles from './PhoneInputWithCountry.module.css';

type PhoneInputWithCountryProps = {
  countryIso: string;
  localNumber: string;
  onCountryChange: (iso: string) => void;
  onLocalNumberChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  showSameAsOwner?: boolean;
  onUseSameAsOwner?: () => void;
};

export function PhoneInputWithCountry({
  countryIso,
  localNumber,
  onCountryChange,
  onLocalNumberChange,
  placeholder = '55 1234 5678',
  hint,
  autoFocus = false,
  showSameAsOwner = false,
  onUseSameAsOwner,
}: PhoneInputWithCountryProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = findCountryByIso(countryIso);

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
    <div className={styles.wrap}>
      <div className={styles.row} ref={wrapRef}>
        <div className={styles.countrySelect}>
          <button
            type="button"
            className={styles.countryButton}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className={styles.flag} aria-hidden>
              {selected.flag}
            </span>
            <span className={styles.dialCode}>{selected.dialCode}</span>
            <span className={styles.chevron} aria-hidden>
              ▾
            </span>
          </button>

          {open ? (
            <div id={listId} className={styles.dropdown} role="listbox" aria-label="País">
              {COUNTRY_DIAL_CODES.map((country) => (
                <button
                  key={country.iso}
                  type="button"
                  role="option"
                  aria-selected={country.iso === countryIso}
                  className={styles.dropdownItem}
                  onClick={() => pickCountry(country)}
                >
                  <span className={styles.flag} aria-hidden>
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
          className={styles.phoneInput}
          value={localNumber}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Número de teléfono"
          onChange={(event) => onLocalNumberChange(digitsOnly(event.target.value))}
        />
      </div>

      {hint ? <p className={styles.hint}>{hint}</p> : null}

      {showSameAsOwner && onUseSameAsOwner ? (
        <button type="button" className={styles.sameNumberBtn} onClick={onUseSameAsOwner}>
          Usar el mismo número del responsable
        </button>
      ) : null}
    </div>
  );
}
