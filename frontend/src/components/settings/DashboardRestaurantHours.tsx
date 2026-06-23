'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { RestaurantHoursFooter } from '@/components/digital-menu/RestaurantHoursFooter';
import { DeliveryProviderHoursDisplay } from '@/components/settings/DeliveryProviderHoursDisplay';
import type {
  DeliveryProviderSchedule,
  RestaurantSchedule,
  RestaurantScheduleCreateInput,
} from '@/lib/api/types';
import { mergeScheduleSavePreservingDelivery } from '@/lib/restaurantScheduleHours';
import { DASHBOARD_SCHEDULE_SERVICE_TYPES } from '@/lib/restaurantServices';
import styles from './DashboardRestaurantHours.module.css';

type DashboardRestaurantHoursProps = {
  schedules: RestaurantSchedule[];
  takeoutEnabled: boolean;
  deliveryEnabled: boolean;
  section?: 'takeout' | 'delivery' | 'both';
  saving?: boolean;
  onSave?: (payload: RestaurantScheduleCreateInput[]) => Promise<void>;
  deliveryProviderSchedules?: DeliveryProviderSchedule[] | null;
  deliveryPartnershipActive?: boolean;
};

export function DashboardRestaurantHours({
  schedules,
  takeoutEnabled,
  deliveryEnabled,
  section = 'both',
  saving = false,
  onSave,
  deliveryProviderSchedules = null,
  deliveryPartnershipActive = false,
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
                {deliveryPartnershipActive
                  ? 'Los horarios de entrega a domicilio los define tu proveedor de entrega.'
                  : 'Los horarios estarán disponibles cuando tu proveedor de entrega apruebe la solicitud.'}
              </p>
            </div>
          </aside>

          {deliveryPartnershipActive && deliveryProviderSchedules ? (
            <DeliveryProviderHoursDisplay
              schedules={deliveryProviderSchedules}
              className={showTakeout ? styles.infoDisplay : styles.embeddedDisplay}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
