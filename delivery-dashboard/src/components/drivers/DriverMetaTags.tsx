import {
  isCurrentRiderApp,
  riderAppTagLabel,
  riderAppTagTitle,
} from '@/lib/drivers/appBuild';
import { motorcycleColorHex } from '@/lib/drivers/motorcycleColors';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import styles from './DriverMetaTags.module.css';

type DriverMetaTagsProps = {
  plate: string;
  motorcycleColor: string;
  compartmentSize: string;
  creditAvailableCents?: number;
  className?: string;
  appVersion?: string | null;
  appBuildNumber?: number | null;
  showAppBuild?: boolean;
};

function compartmentLabel(size: string): string {
  return size === 'grande' ? 'Grande' : 'Normal';
}

export function DriverMetaTags({
  plate,
  motorcycleColor,
  compartmentSize,
  creditAvailableCents,
  className,
  appVersion,
  appBuildNumber,
  showAppBuild = false,
}: DriverMetaTagsProps) {
  const colorLabel = motorcycleColor.trim() || 'Sin color';
  const colorHex = motorcycleColorHex(motorcycleColor);
  const compartment = compartmentLabel(compartmentSize);
  const hasCurrentApp = isCurrentRiderApp(appBuildNumber);
  const appLabel = riderAppTagLabel(appVersion, appBuildNumber);
  const appTitle = riderAppTagTitle(appVersion, appBuildNumber);

  return (
    <div className={[styles.driverMeta, className].filter(Boolean).join(' ')}>
      <span className={styles.driverMetaPlate}>{plate || '—'}</span>
      <span className={styles.driverMetaTag} title={`Color: ${colorLabel}`}>
        <span className={styles.driverColorDot} style={{ background: colorHex }} aria-hidden />
        {colorLabel}
      </span>
      <span className={styles.driverMetaTag} title={`Compartimento: ${compartment}`}>
        {compartment}
      </span>
      {showAppBuild ? (
        <span
          className={hasCurrentApp ? styles.driverMetaTag : styles.driverMetaAppOld}
          title={appTitle}
          aria-label={appTitle}
        >
          {appLabel}
        </span>
      ) : null}
      {creditAvailableCents != null ? (
        <span className={styles.driverMetaCredit}>{formatMoney(creditAvailableCents)} disp.</span>
      ) : null}
    </div>
  );
}
