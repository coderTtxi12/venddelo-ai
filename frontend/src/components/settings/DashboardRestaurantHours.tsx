'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { RestaurantHoursDisplay } from '@/components/digital-menu/RestaurantHoursDisplay';
import { RestaurantHoursFooter } from '@/components/digital-menu/RestaurantHoursFooter';
import type { RestaurantSchedule, RestaurantScheduleCreateInput } from '@/lib/api/types';
import { mergeScheduleSavePreservingDelivery } from '@/lib/restaurantScheduleHours';
import {
  DASHBOARD_INFO_SCHEDULE_SERVICE_TYPES,
  DASHBOARD_SCHEDULE_SERVICE_TYPES,
} from '@/lib/restaurantServices';
import styles from './DashboardRestaurantHours.module.css';

type DashboardRestaurantHoursProps = {
  schedules: RestaurantSchedule[];
  takeoutEnabled: boolean;
  deliveryEnabled: boolean;
  section?: 'takeout' | 'delivery' | 'both';
  saving?: boolean;
  onSave?: (payload: RestaurantScheduleCreateInput[]) => Promise<void>;
};

export function DashboardRestaurantHours({
  schedules,
  takeoutEnabled,
  deliveryEnabled,
  section = 'both',
  saving = false,
  onSave,
}: DashboardRestaurantHoursProps) {
  const showTakeout =
    (section === 'takeout' || section === 'both') && takeoutEnabled && onSave != null;
  const showDelivery = (section === 'delivery' || section === 'both') && deliveryEnabled;

  if (!showTakeout && !showDelivery) return null;

  return (
    <div className={styles.wrap}>
      {showTakeout ? (
        <RestaurantHoursFooter
          schedules={schedules}
          serviceTypes={DASHBOARD_SCHEDULE_SERVICE_TYPES}
          saving={saving}
          onSave={async (payload) => {
            await onSave(mergeScheduleSavePreservingDelivery(payload, schedules));
          }}
        />
      ) : null}

      {showDelivery ? (
        <section
          className={`${styles.deliverySection} ${showTakeout ? styles.deliverySectionInset : ''}`}
          aria-labelledby={showTakeout ? 'delivery-hours-heading' : undefined}
        >
          {showTakeout ? (
            <h3 id="delivery-hours-heading" className={styles.deliverySectionTitle}>
              Entrega a domicilio
            </h3>
          ) : null}

          <aside className={styles.providerNotice} aria-label="Aviso sobre horario de entrega">
            <span className={styles.providerNoticeIcon} aria-hidden>
              <InfoOutlinedIcon sx={{ fontSize: 20 }} />
            </span>
            <div className={styles.providerNoticeBody}>
              <p className={styles.providerNoticeTitle}>Horario gestionado por el proveedor</p>
              <p className={styles.providerNoticeText}>
                Los horarios de entrega a domicilio los define tu proveedor de entrega.
              </p>
            </div>
          </aside>

          <RestaurantHoursDisplay
            schedules={schedules}
            serviceTypes={DASHBOARD_INFO_SCHEDULE_SERVICE_TYPES}
            showHeader={section !== 'delivery' && !showTakeout}
            readOnly
            className={showTakeout ? styles.infoDisplay : styles.embeddedDisplay}
          />
        </section>
      ) : null}
    </div>
  );
}
