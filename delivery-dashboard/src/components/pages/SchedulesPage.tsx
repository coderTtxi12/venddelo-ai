'use client';

import { useEffect, useState } from 'react';
import { DeliveryProviderHoursEditor } from '@/components/settings/DeliveryProviderHoursEditor';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  listMyDeliveryProviderSchedules,
  setMyDeliveryProviderSchedules,
} from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import type { DeliveryProviderSchedule } from '@/lib/api/types';
import styles from './SettingsPage.module.css';

export default function SchedulesPage() {
  const { accessToken } = useAuth();
  const { canWriteProviderConfig, isOperator } = useDeliveryProviderAccess();
  const [schedules, setSchedules] = useState<DeliveryProviderSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedules() {
      if (!accessToken) return;
      setLoading(true);
      setError(null);

      try {
        const rows = await listMyDeliveryProviderSchedules(accessToken);
        if (!cancelled) setSchedules(rows);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudieron cargar los horarios de reparto.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSchedules();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleSaveSchedules = async (
    payload: Parameters<typeof setMyDeliveryProviderSchedules>[1],
  ) => {
    if (!accessToken) {
      setError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await setMyDeliveryProviderSchedules(accessToken, payload);
      const updated = await listMyDeliveryProviderSchedules(accessToken);
      setSchedules(updated);
      setSuccess('Horarios guardados correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudieron guardar los horarios. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelPageShell
      title="Horarios de reparto"
      subtitle="Configura tu horario diurno y nocturno. El turno nocturno solo aplica dentro de tu polígono de cobertura; fuera de él solo cuenta el horario diurno."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.loading,
      }}
    >
      {loading ? (
        <p className={styles.loading} role="status">
          Cargando horarios…
        </p>
      ) : (
        <section className={styles.panel} aria-labelledby="schedules-panel">
          {error ? (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className={styles.successBanner} role="status">
              {success}
            </div>
          ) : null}
          {isOperator ? (
            <div className={styles.operatorNotice} role="status">
              Tu rol de Operador permite consultar los horarios, pero no editarlos.
            </div>
          ) : null}
          <div className={styles.hoursWrap}>
            <DeliveryProviderHoursEditor
              schedules={schedules}
              saving={saving}
              readOnly={!canWriteProviderConfig}
              onSave={handleSaveSchedules}
            />
          </div>
        </section>
      )}
    </PanelPageShell>
  );
}
