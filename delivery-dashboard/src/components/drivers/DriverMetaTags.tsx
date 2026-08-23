import { motorcycleColorHex } from '@/lib/drivers/motorcycleColors';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import styles from './DriverMetaTags.module.css';

type DriverMetaTagsProps = {
  plate: string;
  motorcycleColor: string;
  compartmentSize: string;
  creditAvailableCents?: number;
  className?: string;
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
}: DriverMetaTagsProps) {
  const colorLabel = motorcycleColor.trim() || 'Sin color';
  const colorHex = motorcycleColorHex(motorcycleColor);
  const compartment = compartmentLabel(compartmentSize);

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
      {creditAvailableCents != null ? (
        <span className={styles.driverMetaCredit}>{formatMoney(creditAvailableCents)} disp.</span>
      ) : null}
    </div>
  );
}
