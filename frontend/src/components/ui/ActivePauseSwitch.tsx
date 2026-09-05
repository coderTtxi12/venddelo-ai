'use client';

import styles from './ActivePauseSwitch.module.css';

export type ActivePauseSwitchProps = {
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
};

export function ActivePauseSwitch({
  checked,
  pending = false,
  disabled = false,
  ariaLabel,
  onChange,
}: ActivePauseSwitchProps) {
  const isDisabled = disabled || pending;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      className={`${styles.switch} ${checked ? styles.switchOn : ''} ${pending ? styles.switchPending : ''}`}
      disabled={isDisabled}
      onClick={(event) => {
        event.stopPropagation();
        if (isDisabled) return;
        onChange(!checked);
      }}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}
