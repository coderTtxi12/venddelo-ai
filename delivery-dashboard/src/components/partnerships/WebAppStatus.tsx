'use client';

import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import styles from './WebAppStatus.module.css';

type WebAppStatusProps = {
  hasWebApp: boolean;
  canEdit: boolean;
  busy?: boolean;
  onChange?: (next: boolean) => void;
};

export function WebAppStatus({
  hasWebApp,
  canEdit,
  busy = false,
  onChange,
}: WebAppStatusProps) {
  const label = hasWebApp ? 'Web app' : 'Sin web app';

  if (!canEdit || !onChange) {
    return (
      <span className={`${styles.mark} ${hasWebApp ? styles.on : styles.off}`}>
        <LanguageOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.mark} ${styles.button} ${hasWebApp ? styles.on : styles.off}`}
      aria-pressed={hasWebApp}
      aria-label={hasWebApp ? 'Quitar marca de web app' : 'Marcar web app'}
      disabled={busy}
      onClick={() => onChange(!hasWebApp)}
    >
      <LanguageOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
      {label}
    </button>
  );
}
