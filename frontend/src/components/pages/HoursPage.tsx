'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DashboardRestaurantHours } from '@/components/settings/DashboardRestaurantHours';
import { DeliveryPartnershipStatus } from '@/components/settings/DeliveryPartnershipStatus';
import { useAuth } from '@/hooks/useAuth';
import {
  getRestaurant,
  listRestaurantSchedules,
  setRestaurantSchedules,
} from '@/lib/api/restaurants';
import type { Restaurant, RestaurantDeliveryPartnership, RestaurantSchedule } from '@/lib/api/types';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import { resolveSupplierIdByEmail } from '@/services/db';
import { legacyDb as db } from '@/services/legacyDb';
import styles from './HoursPage.module.css';

export default function HoursPage() {
  const { firebaseUser, accessToken, loading: authLoading } = useAuth();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [schedules, setSchedules] = useState<RestaurantSchedule[]>([]);
  const [deliveryPartnership, setDeliveryPartnership] = useState<RestaurantDeliveryPartnership | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading) return;
      if (!accessToken) {
        setLoadError('No hay sesión activa. Inicia sesión de nuevo.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const resolved = await resolveSupplierIdByEmail(
          db,
          firebaseUser?.email ?? '',
          accessToken,
        );
        if ('error' in resolved) {
          if (!cancelled) setLoadError(resolved.error);
          return;
        }

        const rid = resolved.supplierId;
        const [restaurantData, scheduleRows] = await Promise.all([
          getRestaurant(accessToken, rid),
          listRestaurantSchedules(accessToken, rid),
        ]);

        if (cancelled) return;

        setRestaurantId(rid);
        setRestaurant(restaurantData);
        setSchedules(scheduleRows);

        if (restaurantData.delivery_enabled) {
          try {
            const partnership = await syncRestaurantDeliveryPartnership(
              accessToken,
              rid,
              restaurantData.delivery_enabled,
            );
            if (!cancelled) setDeliveryPartnership(partnership);
          } catch (partnershipError) {
            console.error(partnershipError);
            if (!cancelled) setDeliveryPartnership(null);
          }
        } else {
          setDeliveryPartnership(null);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError('No se pudo cargar el horario del restaurante.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, firebaseUser?.email]);

  const hasScheduleContent =
    restaurant?.takeout_enabled || restaurant?.delivery_enabled;

  if (loading || authLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Cargando horario…</p>
      </div>
    );
  }

  if (loadError || !restaurant || !restaurantId) {
    return (
      <div className={styles.page}>
        <p className={styles.errorBanner}>{loadError ?? 'No se encontró el restaurante.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Horario</h1>
          <p className={styles.subtitle}>
            Configura el horario de recoger en tienda y consulta el de entrega a domicilio.
          </p>
        </div>
      </div>

      <section className={styles.panel} aria-label="Horarios de servicio">
        {!hasScheduleContent ? (
          <p className={styles.empty}>
            Habilita recoger en tienda o entrega a domicilio en{' '}
            <Link href="/settings" className={styles.settingsLink}>
              Configuración
            </Link>{' '}
            para ver los horarios.
          </p>
        ) : (
          <div className={styles.hoursWrap}>
            {restaurant.delivery_enabled ? (
              <DeliveryPartnershipStatus partnership={deliveryPartnership} />
            ) : null}
            <DashboardRestaurantHours
              schedules={schedules}
              takeoutEnabled={restaurant.takeout_enabled}
              deliveryEnabled={restaurant.delivery_enabled}
              onSave={async (payload) => {
                if (!accessToken || !restaurantId) return;
                await setRestaurantSchedules(accessToken, restaurantId, payload);
                const updated = await listRestaurantSchedules(accessToken, restaurantId);
                setSchedules(updated);
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
