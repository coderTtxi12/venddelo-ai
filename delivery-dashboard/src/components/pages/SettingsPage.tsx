'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { ServiceZoneMapDrawer } from '@/components/onboarding/ServiceZoneMapDrawer';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useAuth } from '@/hooks/useAuth';
import {
  getMyDeliveryProvider,
  updateMyDeliveryProvider,
} from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';
import { createDefaultOnboardingData } from '@/lib/onboarding/defaults';
import type { OnboardingData } from '@/lib/onboarding/types';
import {
  buildProfileUpdatePayload,
  providerProfileFromApi,
  validateProviderProfile,
} from '@/lib/settings/providerProfile';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import styles from './SettingsPage.module.css';

async function fileToStoredImage(file: File): Promise<{ dataUrl: string; fileName: string }> {
  const optimized = await prepareImageForUpload(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(optimized);
  });
  return { dataUrl, fileName: optimized.name };
}

export default function SettingsPage() {
  const { accessToken } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<OnboardingData>(() => createDefaultOnboardingData());
  const [initialForm, setInitialForm] = useState<OnboardingData>(() => createDefaultOnboardingData());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

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
        setSlug(response.provider?.slug ?? null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudo cargar tu configuración. Intenta de nuevo.');
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

  const handleImagePick = async (file: File) => {
    try {
      const stored = await fileToStoredImage(file);
      patchForm({ logoDataUrl: stored.dataUrl, logoFileName: stored.fileName });
    } catch (err) {
      console.error(err);
      setError('No se pudo procesar la imagen. Prueba con otro archivo.');
    }
  };

  const handleSave = async () => {
    if (!accessToken) {
      setError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    const validationError = validateProviderProfile(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateMyDeliveryProvider(
        accessToken,
        buildProfileUpdatePayload(form),
      );
      const refreshed = await getMyDeliveryProvider(accessToken);
      const nextForm = providerProfileFromApi(refreshed) ?? form;
      setForm(nextForm);
      setInitialForm(nextForm);
      setSlug(updated.slug);
      setSuccess('Cambios guardados correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudieron guardar los cambios. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  const logoPreview = form.logoDataUrl?.startsWith('data:')
    ? form.logoDataUrl
    : storagePublicUrl(form.logoDataUrl);

  return (
    <PanelPageShell
      title="Configuración"
      subtitle="Edita el logo, contacto y zona de reparto de tu empresa de delivery."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.loading,
      }}
      action={
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={loading || saving || !isDirty}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      }
    >
      {loading ? (
        <p className={styles.loading} role="status">
          Cargando configuración…
        </p>
      ) : (
        <>
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

          <section className={styles.panel} aria-labelledby="settings-logo">
            <h2 id="settings-logo" className={styles.panelTitle}>
              Logo
            </h2>
            <p className={styles.panelHint}>
              Se muestra en tu perfil y comunicación con restaurantes.
            </p>
            <div className={styles.logoRow}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo de la empresa" className={styles.logoPreview} />
              ) : (
                <div className={styles.logoPlaceholder} aria-hidden>
                  ?
                </div>
              )}
              <div className={styles.logoActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <CloudUploadOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                  {logoPreview ? 'Cambiar logo' : 'Subir logo'}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImagePick(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="settings-company">
            <h2 id="settings-company" className={styles.panelTitle}>
              Empresa
            </h2>
            <p className={styles.panelHint}>
              Información pública de tu empresa de delivery.
            </p>
            <div className={styles.formGrid}>
              <label className={`${styles.label} ${styles.formGridFull}`}>
                Nombre de la empresa
                <input
                  className={styles.input}
                  value={form.companyName}
                  placeholder="Ej. Mexy Reparto"
                  onChange={(e) => patchForm({ companyName: e.target.value })}
                />
              </label>
              {slug ? (
                <div className={`${styles.readonlyField} ${styles.formGridFull}`}>
                  <span className={styles.readonlyLabel}>Identificador interno</span>
                  <span className={styles.readonlyValue}>{slug}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="settings-contact">
            <h2 id="settings-contact" className={styles.panelTitle}>
              Contacto
            </h2>
            <p className={styles.panelHint}>
              Persona responsable y WhatsApp operativo de la empresa.
            </p>
            <div className={styles.formGrid}>
              <label className={`${styles.label} ${styles.formGridFull}`}>
                Responsable
                <input
                  className={styles.input}
                  value={form.responsibleName}
                  placeholder="Nombre completo"
                  onChange={(e) => patchForm({ responsibleName: e.target.value })}
                />
              </label>
              <div className={styles.formGridFull}>
                <span className={styles.fieldLabel}>Celular del responsable</span>
                <PhoneInputWithCountry
                  countryIso={form.responsiblePhoneCountryIso}
                  localNumber={form.responsiblePhoneLocal}
                  hint="Incluye solo el número local, sin lada."
                  onCountryChange={(iso) => patchForm({ responsiblePhoneCountryIso: iso })}
                  onLocalNumberChange={(value) => patchForm({ responsiblePhoneLocal: value })}
                />
              </div>
              <div className={styles.formGridFull}>
                <span className={styles.fieldLabel}>WhatsApp de la empresa</span>
                <PhoneInputWithCountry
                  countryIso={form.whatsappCountryIso}
                  localNumber={form.whatsappLocal}
                  hint="Número oficial para operaciones de reparto."
                  showSameAsOwner
                  onCountryChange={(iso) =>
                    patchForm({ whatsappCountryIso: iso, whatsappSameAsResponsible: false })
                  }
                  onLocalNumberChange={(value) =>
                    patchForm({ whatsappLocal: value, whatsappSameAsResponsible: false })
                  }
                  onUseSameAsOwner={() =>
                    patchForm({
                      whatsappCountryIso: form.responsiblePhoneCountryIso,
                      whatsappLocal: form.responsiblePhoneLocal,
                      whatsappSameAsResponsible: true,
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="settings-zone">
            <h2 id="settings-zone" className={styles.panelTitle}>
              Zona de reparto
            </h2>
            <p className={styles.panelHint}>
              Ajusta el nombre y el polígono del área donde realizas entregas.
            </p>
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
          </section>
        </>
      )}
    </PanelPageShell>
  );
}
