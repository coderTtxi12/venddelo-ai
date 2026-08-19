import type { MouseEvent } from 'react';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import { WhatsappIcon } from '@/components/partnerships/WhatsappIcon';
import { phoneDigits } from '@/lib/phone/phoneDigits';
import styles from './DriverPhoneContact.module.css';

type DriverPhoneContactProps = {
  phone: string | null | undefined;
  className?: string;
  compact?: boolean;
  /** Hide the phone number and keep only WhatsApp / call actions. */
  iconsOnly?: boolean;
  /** Stops parent button handlers when embedded in clickable cards. */
  stopPropagation?: boolean;
};

export function DriverPhoneContact({
  phone,
  className,
  compact = false,
  iconsOnly = false,
  stopPropagation = false,
}: DriverPhoneContactProps) {
  const trimmed = phone?.trim();
  if (!trimmed) return null;

  const digits = phoneDigits(trimmed);
  if (!digits) return null;

  const telHref = trimmed.startsWith('+') ? `tel:${trimmed.replace(/\s/g, '')}` : `tel:+${digits}`;
  const whatsappHref = `https://wa.me/${digits}`;

  const handleClick = stopPropagation
    ? (event: MouseEvent) => event.stopPropagation()
    : undefined;

  const rootClass = [
    styles.root,
    compact ? styles.compact : '',
    iconsOnly ? styles.iconsOnly : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass} onClick={handleClick}>
      {iconsOnly ? null : (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.numberLink}
          aria-label={`WhatsApp ${trimmed}`}
        >
          {trimmed}
        </a>
      )}
      <span className={styles.actions} aria-hidden={false}>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.actionWhatsApp}
          aria-label={`Abrir WhatsApp de ${trimmed}`}
        >
          <WhatsappIcon size={15} />
        </a>
        <a href={telHref} className={styles.actionPhone} aria-label={`Llamar a ${trimmed}`}>
          <PhoneOutlinedIcon sx={{ fontSize: 15 }} />
        </a>
      </span>
    </div>
  );
}
