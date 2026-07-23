'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ServiceZoneMapDrawer } from '@/components/onboarding/ServiceZoneMapDrawer';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useAuth } from '@/hooks/useAuth';
import { getMyDeliveryProvider, updateMyDeliveryProvider } from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import { createDefaultOnboardingData } from '@/lib/onboarding/defaults';
import type { OnboardingData } from '@/lib/onboarding/types';
import {
  buildProfileUpdatePayload,
  providerProfileFromApi,
  validateServiceZone,
} from '@/lib/settings/providerProfile';
import styles from './SettingsPage.module.css';

function zoneFieldsDirty(current: OnboardingData, initial: OnboardingData): boolean {
  return (
    current.serviceZoneName !== initial.serviceZoneName ||
    JSON.stringify(current.serviceZonePolygon) !== JSON.stringify(initial.serviceZonePolygon) ||
    current.serviceZoneCenterLat !== initial.serviceZoneCenterLat ||
    current.serviceZoneCenterLng !== initial.serviceZoneCenterLng
  );
}

export default function ServiceZonePage() {
  const { accessToken } = useAuth();
  const { canWriteProviderConfig, isOperator } = useDeliveryProviderAccess();
  const [form, setForm] = useState<OnboardingData>(() => createDefaultOnboardingData());
  const [initialForm, setInitialForm] = useState<OnboardingData>(() => createDefaultOnboardingData());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDirty = useMemo(() => zoneFieldsDirty(form, initialForm), [form, initialForm]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) return;
      setLoading(true);
      setError(null);

      try {
        const response = await getMyDeliveryProvider(accessToken);
        if (cancelled) return;

        const profile = providerProfileFromApi(response);
        if (!profile) {
          setError('No encontramos tu perfil de delivery. Completa el onboarding primero.');
          return;
        }

        setForm(profile);
        setInitialForm(profile);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudo cargar tu zona de reparto. Intenta de nuevo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const patchForm = useCallback((patch: Partial<OnboardingData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSuccess(null);
    setError(null);
  }, []);

  const handleServiceZonePolygonChange = useCallback(
    (polygon: OnboardingData['serviceZonePolygon']) => {
      patchForm({ serviceZonePolygon: polygon });
    },
    [patchForm],
  );

  const handleSave = async () => {
    if (!accessToken) {
      setError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    const validationError = validateServiceZone(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateMyDeliveryProvider(accessToken, buildProfileUpdatePayload(form));
      const refreshed = await getMyDeliveryProvider(accessToken);
      const nextForm = providerProfileFromApi(refreshed) ?? form;
      setForm(nextForm);
      setInitialForm(nextForm);
      setSuccess('Cerco geográfico guardado correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo guardar el cerco geográfico. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelPageShell
      title="Cerco geográfico"
      subtitle="Define el área donde realizas entregas. Ajusta el nombre de la zona y dibuja el polígono en el mapa."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.loading,
      }}
      action={
        canWriteProviderConfig ? (
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={loading || saving || !isDirty}
            onClick={() => void handleSave()}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        ) : null
      }
    >
      {loading ? (
        <p className={styles.loading} role="status">
          Cargando zona de reparto…
        </p>
      ) : (
        <section className={styles.panel} aria-labelledby="service-zone-panel">
          {isOperator ? (
            <div className={styles.operatorNotice} role="status">
              Tu rol de Operador permite consultar el cerco geográfico, pero no editarlo.
            </div>
          ) : null}
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
          <fieldset disabled={!canWriteProviderConfig} className={styles.readOnlyFieldset}>
          <label className={`${styles.label} ${styles.formGridFull}`}>
            Nombre de la zona
            <input
              className={styles.input}
              value={form.serviceZoneName}
              placeholder="Cobertura principal"
              onChange={(e) => patchForm({ serviceZoneName: e.target.value })}
            />
          </label>
          <div className={styles.mapWrap}>
            <ServiceZoneMapDrawer
              polygon={form.serviceZonePolygon}
              searchAddress={form.serviceZoneSearchAddress}
              centerLat={form.serviceZoneCenterLat}
              centerLng={form.serviceZoneCenterLng}
              onSearchPlaceChange={(place) =>
                patchForm({
                  serviceZoneSearchAddress: place.address,
                  serviceZoneCenterLat: place.latitude,
                  serviceZoneCenterLng: place.longitude,
                })
              }
              onPolygonChange={handleServiceZonePolygonChange}
            />
          </div>
          </fieldset>
        </section>
      )}
    </PanelPageShell>
  );
}
