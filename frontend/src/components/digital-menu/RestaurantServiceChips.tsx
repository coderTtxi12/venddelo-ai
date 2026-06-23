import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import {
  RESTAURANT_SERVICE_LABELS,
  type RestaurantServiceType,
} from '@/lib/restaurantServices';
import styles from './RestaurantServiceChips.module.css';

const SERVICE_ICONS: Record<RestaurantServiceType, typeof StorefrontOutlinedIcon> = {
  takeout: StorefrontOutlinedIcon,
  delivery: BoltOutlinedIcon,
};

type RestaurantServiceChipsProps = {
  services: RestaurantServiceType[];
  className?: string;
};

export function RestaurantServiceChips({ services, className }: RestaurantServiceChipsProps) {
  if (services.length === 0) return null;

  return (
    <ul
      className={[styles.serviceList, className].filter(Boolean).join(' ')}
      aria-label="Servicios disponibles"
    >
      {services.map((type) => {
        const Icon = SERVICE_ICONS[type];
        return (
          <li key={type} className={styles.serviceChip}>
            <Icon className={styles.serviceIcon} aria-hidden />
            <span>{RESTAURANT_SERVICE_LABELS[type]}</span>
          </li>
        );
      })}
    </ul>
  );
}
