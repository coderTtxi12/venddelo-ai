'use client';

import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import styles from './HoldStatus.module.css';

type HoldStatusProps = {
  onHold: boolean;
  canEdit: boolean;
  busy?: boolean;
  onChange?: (next: boolean) => void;
};

export function HoldStatus({
  onHold,
  canEdit,
  busy = false,
  onChange,
}: HoldStatusProps) {
  const label = onHold ? 'En hold' : 'Activo';
  const Icon = onHold ? PauseCircleOutlinedIcon : PlayArrowOutlinedIcon;

  if (!canEdit || !onChange) {
    return (
      <span className={`${styles.mark} ${onHold ? styles.on : styles.off}`}>
        <Icon sx={{ fontSize: 16 }} aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.mark} ${styles.button} ${onHold ? styles.on : styles.off}`}
      aria-pressed={onHold}
      aria-label={onHold ? 'Quitar hold' : 'Poner en hold'}
      disabled={busy}
      onClick={() => onChange(!onHold)}
    >
      <Icon sx={{ fontSize: 16 }} aria-hidden />
      {label}
    </button>
  );
}
