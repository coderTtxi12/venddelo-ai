import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import {
  MEXY_ON_HOLD_DETAIL,
  MEXY_ON_HOLD_TITLE,
  MEXY_ON_HOLD_WHATSAPP_DISPLAY,
  mexyOnHoldWhatsAppUrl,
} from '@/lib/dispatch/mexyOnHold';
import styles from './MexyOnHoldNotice.module.css';

export function MexyOnHoldNotice() {
  return (
    <div className={styles.alert} role="alert">
      <PauseCircleOutlinedIcon className={styles.icon} sx={{ fontSize: 22 }} aria-hidden />
      <div className={styles.copy}>
        <h2 className={styles.title} tabIndex={-1}>
          {MEXY_ON_HOLD_TITLE}
        </h2>
        <p className={styles.detail}>{MEXY_ON_HOLD_DETAIL}</p>
        <a
          className={styles.cta}
          href={mexyOnHoldWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon sx={{ fontSize: 18 }} aria-hidden />
          Escribir a Mexy
          <span className={styles.phone}>{MEXY_ON_HOLD_WHATSAPP_DISPLAY}</span>
        </a>
      </div>
    </div>
  );
}
