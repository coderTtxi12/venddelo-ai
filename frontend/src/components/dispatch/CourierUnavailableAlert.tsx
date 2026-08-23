import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import type { PublicDeliveryService } from '@/lib/api/public';
import {
  restaurantCourierServiceNotice,
  type CourierServiceNoticeCopy,
} from '@/lib/courierUnavailableCopy';
import styles from './CourierUnavailableAlert.module.css';

type ServiceSlice = Pick<PublicDeliveryService, 'available' | 'reason' | 'weather_mode'>;

function noticeIcon(copy: CourierServiceNoticeCopy) {
  if (copy.tone === 'weather' || /lluvia/i.test(`${copy.title} ${copy.detail}`)) {
    return WaterDropOutlinedIcon;
  }
  if (/horario/i.test(copy.detail)) return ScheduleOutlinedIcon;
  if (/pausó/i.test(copy.detail)) return PauseCircleOutlinedIcon;
  return InfoOutlinedIcon;
}

export function CourierUnavailableAlert({
  service,
  reason = null,
}: {
  service?: ServiceSlice | null;
  reason?: string | null;
}) {
  const copy = restaurantCourierServiceNotice(
    service ?? {
      available: false,
      reason,
      weather_mode: 'none',
    },
  );
  if (!copy) return null;

  const Icon = noticeIcon(copy);
  const toneClass = copy.tone === 'weather' ? styles.weather : styles.blocked;

  return (
    <div className={`${styles.alert} ${toneClass}`} role="alert">
      <Icon className={styles.icon} sx={{ fontSize: 22 }} aria-hidden />
      <div className={styles.copy}>
        <p className={styles.title}>{copy.title}</p>
        <p className={styles.detail}>{copy.detail}</p>
      </div>
    </div>
  );
}
