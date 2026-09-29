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
  deliveryEnabled,
  section = 'both',
  saving = false,
  onSave,
  deliveryProviderSchedules = null,
  deliveryPartnershipActive = false,
}: DashboardRestaurantHoursProps) {
  const showTakeout =
    (section === 'takeout' || section === 'both') && onSave != null;
  const showDelivery = (section === 'delivery' || section === 'both') && deliveryEnabled;

  if (!showTakeout && !showDelivery) return null;

  return (
    <div className={styles.wrap}>
      {showTakeout ? (
        <RestaurantHoursFooter
          schedules={schedules}
          serviceTypes={DASHBOARD_SCHEDULE_SERVICE_TYPES}
          title="Horario de tu negocio"
          hint="Configura los días y turnos en que atiendes."
          serviceLabels={{ takeout: 'Horario de tu negocio' }}
          saving={saving}
          onSave={async (payload) => {
            await onSave(mergeScheduleSavePreservingDelivery(payload, schedules));
          }}
        />
      ) : null}

      {showDelivery ? (
        <section
          className={`${styles.deliverySection} ${showTakeout ? styles.deliverySectionInset : ''}`}
          aria-labelledby="delivery-hours-heading"
        >
          <h3 id="delivery-hours-heading" className={styles.deliverySectionTitle}>
            Horario de Mexy
          </h3>

          <aside className={styles.providerNotice} aria-label="Aviso sobre el horario de Mexy">
            <span className={styles.providerNoticeIcon} aria-hidden>
              <InfoOutlinedIcon sx={{ fontSize: 20 }} />
            </span>
            <div className={styles.providerNoticeBody}>
              <p className={styles.providerNoticeTitle}>Solo lectura</p>
              <p className={styles.providerNoticeText}>
                {deliveryPartnershipActive
                  ? 'Lo define Mexy, tu proveedor de reparto.'
                  : 'Aparecerá cuando Mexy apruebe tu solicitud.'}
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
