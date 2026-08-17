'use client';

import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import { useRouter } from 'next/navigation';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import styles from './ZoneSwitcher.module.css';

type ZoneSwitcherProps = {
  onAddZone?: () => void;
};

export default function ZoneSwitcher({ onAddZone }: ZoneSwitcherProps) {
  const router = useRouter();
  const { canWriteProviderConfig } = useDeliveryProviderAccess();
  const { loading, zones, selectedZoneId, setSelectedZoneId } = useDeliveryZone();

  const handleAddZone = () => {
    if (onAddZone) {
      onAddZone();
      return;
    }
    router.push('/cerco-geografico');
  };

  if (loading) {
    return (
      <div className={styles.bar}>
        <p className={styles.loading} role="status">
          Cargando zonas…
        </p>
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className={styles.bar}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Aún no tienes zonas de reparto</p>
          {canWriteProviderConfig ? (
            <button type="button" className={styles.emptyAction} onClick={handleAddZone}>
              <AddOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
              Agregar zona
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <div className={styles.tablist} role="tablist" aria-label="Zonas de reparto">
        {zones.map((zone) => {
          const selected = zone.id === selectedZoneId;
          return (
            <button
              key={zone.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
              onClick={() => setSelectedZoneId(zone.id)}
            >
              {zone.name}
            </button>
          );
        })}
        {onAddZone && canWriteProviderConfig ? (
          <button type="button" className={styles.addBtn} onClick={onAddZone}>
            <AddOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
            Agregar zona
          </button>
        ) : null}
      </div>
    </div>
  );
}
