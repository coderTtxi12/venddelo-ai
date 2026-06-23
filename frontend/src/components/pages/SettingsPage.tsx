'use client';

import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { DashboardRestaurantHours } from '@/components/settings/DashboardRestaurantHours';
import { DeliveryPartnershipStatus } from '@/components/settings/DeliveryPartnershipStatus';
import { RestaurantLocationMapPicker } from '@/components/settings/RestaurantLocationMapPicker';
import type { RestaurantLocationMapPickerHandle } from '@/components/settings/RestaurantLocationMapPicker';
import { RestaurantPlaceAutocomplete } from '@/components/settings/RestaurantPlaceAutocomplete';
import type { MapLocationUpdate } from '@/lib/loadGoogleMapsPlaces';
import { useAuth } from '@/hooks/useAuth';
import {
  checkRestaurantSubdomainAvailability,
  getRestaurant,
  listRestaurantPaymentMethods,
  listRestaurantSchedules,
  setRestaurantPaymentMethods,
  setRestaurantSchedules,
  updateRestaurant,
} from '@/lib/api/restaurants';
import type {
  DeliveryProviderSchedule,
  Restaurant,
  RestaurantDeliveryPartnership,
  RestaurantSchedule,
} from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import {
  fetchActiveDeliveryProviderConfig,
  isActiveDeliveryPartnership,
} from '@/lib/fetchActiveDeliveryProviderConfig';
import {
  createDefaultPaymentMatrix,
  matrixToPaymentCreates,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  paymentMethodsToMatrix,
  providerPaymentMethodsToDeliveryMatrix,
  type PaymentMethodMatrix,
} from '@/lib/restaurantPaymentConfig';
import {
  MENU_PUBLIC_DOMAIN,
  normalizeSubdomainInput,
  restaurantPublicMenuUrl,
  subdomainAvailabilityMessage,
  validateSubdomain,
} from '@/lib/restaurantSubdomain';
import {
  RESTAURANT_SERVICE_LABELS,
  RESTAURANT_SERVICE_ORDER,
  type RestaurantServiceType,
} from '@/lib/restaurantServices';
import { DEFAULT_COUNTRY_ISO } from '@/lib/phone/countryDialCodes';
import { buildPhoneE164, parseE164Phone } from '@/lib/phone/parseE164';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { uploadRestaurantAsset } from '@/lib/storage/upload';
import { resolveSupplierIdByEmail } from '@/services/db';
import { legacyDb as db } from '@/services/legacyDb';
import styles from './SettingsPage.module.css';

type LocationDraft = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

function Switch({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.slider} aria-hidden="true" />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleMeta}>
        <div className={styles.toggleLabel}>{label}</div>
        {hint ? <div className={styles.toggleHint}>{hint}</div> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

export default function SettingsPage() {
  const { firebaseUser, accessToken, loading: authLoading } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const mapPickerRef = useRef<RestaurantLocationMapPickerHandle>(null);

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [savedSubdomain, setSavedSubdomain] = useState('');
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const [subdomainChecking, setSubdomainChecking] = useState(false);
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [subdomainVerified, setSubdomainVerified] = useState(true);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<LocationDraft>({
    address: '',
    latitude: null,
    longitude: null,
    placeId: null,
  });
  const [takeoutEnabled, setTakeoutEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [deliveryPartnership, setDeliveryPartnership] = useState<RestaurantDeliveryPartnership | null>(
    null,
  );
  const [deliveryPartnershipLoading, setDeliveryPartnershipLoading] = useState(false);
  const [deliveryPartnershipError, setDeliveryPartnershipError] = useState<string | null>(null);
  const [deliveryProviderSchedules, setDeliveryProviderSchedules] = useState<
    DeliveryProviderSchedule[] | null
  >(null);
  const [paymentMatrix, setPaymentMatrix] = useState<PaymentMethodMatrix>(
    createDefaultPaymentMatrix(),
  );
  const [schedules, setSchedules] = useState<RestaurantSchedule[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [whatsappCountryIso, setWhatsappCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [whatsappLocal, setWhatsappLocal] = useState('');
  const [whatsappTouched, setWhatsappTouched] = useState(false);

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
        const [restaurantData, scheduleRows, paymentRows] = await Promise.all([
          getRestaurant(accessToken, rid),
          listRestaurantSchedules(accessToken, rid),
          listRestaurantPaymentMethods(accessToken, rid),
        ]);

        if (cancelled) return;

        setRestaurantId(rid);
        setRestaurant(restaurantData);
        setName(restaurantData.name);
        setSubdomain(restaurantData.subdomain);
        setSavedSubdomain(restaurantData.subdomain);
        setSubdomainError(null);
        setSubdomainTouched(false);
        setSubdomainVerified(true);
        setDescription(restaurantData.description ?? '');
        setLocation({
          address: restaurantData.address ?? '',
          latitude: restaurantData.latitude,
          longitude: restaurantData.longitude,
          placeId: restaurantData.place_id,
        });
        const whatsapp = parseE164Phone(restaurantData.whatsapp_phone);
        setWhatsappCountryIso(whatsapp.countryIso);
        setWhatsappLocal(whatsapp.localNumber);
        setWhatsappTouched(false);
        setTakeoutEnabled(restaurantData.takeout_enabled);
        setDeliveryEnabled(restaurantData.delivery_enabled);
        setDeliveryPartnershipError(null);

        let nextPaymentMatrix =
          paymentRows.length > 0 ? paymentMethodsToMatrix(paymentRows) : createDefaultPaymentMatrix();
        let nextProviderSchedules: DeliveryProviderSchedule[] | null = null;

        if (restaurantData.delivery_enabled) {
          setDeliveryPartnershipLoading(true);
          try {
            const partnership = await syncRestaurantDeliveryPartnership(
              accessToken,
              rid,
              restaurantData.delivery_enabled,
            );
            if (!cancelled) setDeliveryPartnership(partnership);

            if (isActiveDeliveryPartnership(partnership)) {
              const providerConfig = await fetchActiveDeliveryProviderConfig(
                accessToken,
                rid,
                partnership,
              );
              if (providerConfig) {
                nextProviderSchedules = providerConfig.schedules;
                nextPaymentMatrix = {
                  ...nextPaymentMatrix,
                  delivery: providerPaymentMethodsToDeliveryMatrix(providerConfig.paymentMethods),
                };
              }
            }
          } catch (partnershipError) {
            console.error(partnershipError);
            if (!cancelled) {
              setDeliveryPartnership(null);
              setDeliveryPartnershipError(
                'No se pudo enviar la solicitud a Mexy Reparto. Intenta guardar de nuevo.',
              );
            }
          } finally {
            if (!cancelled) setDeliveryPartnershipLoading(false);
          }
        } else {
          setDeliveryPartnership(null);
        }

        if (!cancelled) {
          setPaymentMatrix(nextPaymentMatrix);
          setDeliveryProviderSchedules(nextProviderSchedules);
        }
        setSchedules(scheduleRows);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError('No se pudo cargar la configuración del restaurante.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, firebaseUser?.email]);

  useEffect(() => {
    if (!accessToken || !restaurantId || !subdomainTouched) return;

    const formatError = validateSubdomain(subdomain);
    if (formatError) {
      setSubdomainError(formatError);
      setSubdomainChecking(false);
      setSubdomainVerified(false);
      return;
    }

    if (subdomain === savedSubdomain) {
      setSubdomainError(null);
      setSubdomainChecking(false);
      setSubdomainVerified(true);
      return;
    }

    let cancelled = false;
    setSubdomainChecking(true);
    setSubdomainVerified(false);

    const timer = window.setTimeout(() => {
      void checkRestaurantSubdomainAvailability(accessToken, subdomain, restaurantId)
        .then((result) => {
          if (cancelled) return;
          const message = subdomainAvailabilityMessage(result);
          setSubdomainError(message);
          setSubdomainVerified(message === null);
        })
        .catch(() => {
          if (cancelled) return;
          setSubdomainError('No se pudo verificar la disponibilidad del subdominio.');
          setSubdomainVerified(false);
        })
        .finally(() => {
          if (!cancelled) setSubdomainChecking(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, restaurantId, savedSubdomain, subdomain, subdomainTouched]);

  const subdomainPreviewUrl = useMemo(() => {
    const normalized = normalizeSubdomainInput(subdomain);
    if (!normalized || validateSubdomain(normalized)) return null;
    return restaurantPublicMenuUrl(normalized);
  }, [subdomain]);

  const canSaveSubdomain = useMemo(() => {
    if (!subdomain.trim()) return false;
    if (validateSubdomain(subdomain)) return false;
    if (subdomainChecking) return false;
    if (!subdomainVerified) return false;
    if (subdomainError) return false;
    return true;
  }, [subdomain, subdomainChecking, subdomainError, subdomainVerified]);

  const whatsappError = useMemo(() => {
    const digits = whatsappLocal.replace(/\D/g, '');
    if (digits.length < 8) {
      return 'Ingresa el WhatsApp de tu negocio (mínimo 8 dígitos).';
    }
    return null;
  }, [whatsappLocal]);

  const canSaveWhatsapp = whatsappError === null;

  const handlePlaceSelected = useCallback(
    (place: { address: string; latitude: number; longitude: number; placeId: string | null }) => {
      setLocation({
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.placeId,
      });
      setSaveOk(false);
    },
    [],
  );

  const handleMapLocationChange = useCallback((update: MapLocationUpdate) => {
    setLocation((prev) => ({
      ...prev,
      latitude: update.latitude,
      longitude: update.longitude,
      address: update.address ?? prev.address,
      placeId: update.placeId !== undefined ? update.placeId : null,
    }));
    setSaveOk(false);
  }, []);

  const handleLogoUpload = useCallback(
    async (file: File) => {
      if (!accessToken || !restaurantId) return;
      setUploadingLogo(true);
      setSaveError(null);
      try {
        const path = await uploadRestaurantAsset(accessToken, restaurantId, 'logo', file);
        const updated = await updateRestaurant(accessToken, restaurantId, { logo_path: path });
        setRestaurant(updated);
      } catch (error) {
        console.error(error);
        setSaveError('No se pudo subir el logo.');
      } finally {
        setUploadingLogo(false);
      }
    },
    [accessToken, restaurantId],
  );

  const setPaymentEnabled = (
    serviceType: RestaurantServiceType,
    method: (typeof PAYMENT_METHOD_ORDER)[number],
    enabled: boolean,
  ) => {
    setPaymentMatrix((prev) => ({
      ...prev,
      [serviceType]: { ...prev[serviceType], [method]: enabled },
    }));
    setSaveOk(false);
  };

  const handleSave = async () => {
    if (!accessToken || !restaurantId || !canSaveSubdomain || !canSaveWhatsapp) return;

    setSaving(true);
    setSaveError(null);
    setSaveOk(false);

    const markerCoords = mapPickerRef.current?.getPosition();
    const latitude = markerCoords?.latitude ?? location.latitude;
    const longitude = markerCoords?.longitude ?? location.longitude;
    const normalizedSubdomain = normalizeSubdomainInput(subdomain);

    try {
      const updatedRestaurant = await updateRestaurant(accessToken, restaurantId, {
        name: name.trim(),
        subdomain: normalizedSubdomain,
        description: description.trim() || null,
        address: location.address.trim() || null,
        latitude,
        longitude,
        place_id: location.placeId,
        takeout_enabled: takeoutEnabled,
        delivery_enabled: deliveryEnabled,
        whatsapp_phone: buildPhoneE164(whatsappCountryIso, whatsappLocal),
      });

      try {
        await setRestaurantPaymentMethods(
          accessToken,
          restaurantId,
          matrixToPaymentCreates(paymentMatrix, {
            serviceTypes: deliveryPartnershipActive ? ['takeout'] : ['takeout', 'delivery'],
          }),
        );
      } catch (paymentError) {
        console.error(paymentError);
        setSaveError(
          'La ubicación se guardó, pero no se pudieron actualizar los métodos de pago.',
        );
      }

      setRestaurant(updatedRestaurant);
      setSubdomain(updatedRestaurant.subdomain);
      setSavedSubdomain(updatedRestaurant.subdomain);
      setSubdomainError(null);
      setSubdomainTouched(false);
      setSubdomainVerified(true);
      setLocation({
        address: updatedRestaurant.address ?? '',
        latitude: updatedRestaurant.latitude,
        longitude: updatedRestaurant.longitude,
        placeId: updatedRestaurant.place_id,
      });
      const savedWhatsapp = parseE164Phone(updatedRestaurant.whatsapp_phone);
      setWhatsappCountryIso(savedWhatsapp.countryIso);
      setWhatsappLocal(savedWhatsapp.localNumber);
      setWhatsappTouched(false);
      setSaveOk(true);

      if (updatedRestaurant.delivery_enabled) {
        setDeliveryPartnershipLoading(true);
        setDeliveryPartnershipError(null);
        try {
          const partnership = await syncRestaurantDeliveryPartnership(
            accessToken,
            restaurantId,
            updatedRestaurant.delivery_enabled,
          );
          setDeliveryPartnership(partnership);
          if (isActiveDeliveryPartnership(partnership)) {
            const providerConfig = await fetchActiveDeliveryProviderConfig(
              accessToken,
              restaurantId,
              partnership,
            );
            if (providerConfig) {
              setDeliveryProviderSchedules(providerConfig.schedules);
              setPaymentMatrix((prev) => ({
                ...prev,
                delivery: providerPaymentMethodsToDeliveryMatrix(providerConfig.paymentMethods),
              }));
            }
          } else {
            setDeliveryProviderSchedules(null);
          }
          if (!partnership) {
            setDeliveryPartnershipError(
              'No se pudo registrar la solicitud con Mexy Reparto. Intenta guardar de nuevo.',
            );
          }
        } catch (partnershipError) {
          console.error(partnershipError);
          setDeliveryPartnership(null);
          setDeliveryPartnershipError(
            'No se pudo enviar la solicitud a Mexy Reparto. Intenta guardar de nuevo.',
          );
        } finally {
          setDeliveryPartnershipLoading(false);
        }
      } else {
        setDeliveryPartnership(null);
        setDeliveryProviderSchedules(null);
        setDeliveryPartnershipError(null);
      }
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError && error.code === 'conflict') {
        setSubdomainError('Este subdominio ya está en uso. Elige otro.');
        setSaveError('No se pudo guardar: el subdominio ya está en uso.');
      } else if (error instanceof ApiError && error.httpStatus === 422) {
        setSubdomainError(error.message);
        setSaveError('Revisa el subdominio e inténtalo de nuevo.');
      } else {
        setSaveError('No se pudo guardar la configuración. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  const hasScheduleContent = takeoutEnabled || deliveryEnabled;
  const deliveryPartnershipActive = isActiveDeliveryPartnership(deliveryPartnership);

  const logoUrl = storagePublicUrl(restaurant?.logo_path ?? null);

  if (loading || authLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Cargando configuración…</p>
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
          <h1 className={styles.title}>Configuración del restaurante</h1>
          <p className={styles.subtitle}>
            Administra identidad, WhatsApp de pedidos, ubicación, tipos de entrega, métodos de pago y
            horarios de servicio.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={saving || !name.trim() || !canSaveSubdomain || !canSaveWhatsapp}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando…' : saveOk ? 'Cambios guardados' : 'Guardar configuración'}
        </button>
      </div>

      {saveError ? (
        <p className={styles.errorBanner} role="alert">
          {saveError}
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="settings-identity">
        <h2 id="settings-identity" className={styles.panelTitle}>
          Identidad
        </h2>
        <p className={styles.panelHint}>
          Nombre, subdominio y logo visibles en el menú digital.
        </p>

        <div className={styles.logoRow}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className={styles.logoPreview} />
          ) : (
            <div className={styles.logoPlaceholder}>{(name.trim()[0] ?? '?').toUpperCase()}</div>
          )}
          <div>
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={uploadingLogo}
              onClick={() => logoInputRef.current?.click()}
            >
              {uploadingLogo ? 'Subiendo…' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLogoUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className={styles.formGrid}>
          <label className={`${styles.label} ${styles.formGridFull}`}>
            Nombre del restaurante
            <input
              className={styles.input}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaveOk(false);
              }}
            />
          </label>
          <div className={`${styles.label} ${styles.formGridFull}`}>
            <span id="settings-subdomain-label">Subdominio del menú</span>
            <div
              className={`${styles.subdomainInputWrap} ${
                subdomainError ? styles.subdomainInputWrapError : ''
              }`}
            >
              <input
                id="settings-subdomain"
                className={styles.subdomainInput}
                value={subdomain}
                autoComplete="off"
                spellCheck={false}
                aria-labelledby="settings-subdomain-label"
                aria-describedby="settings-subdomain-help settings-subdomain-feedback"
                aria-invalid={subdomainError ? true : undefined}
                onChange={(e) => {
                  setSubdomain(normalizeSubdomainInput(e.target.value));
                  setSubdomainTouched(true);
                  setSubdomainVerified(false);
                  setSaveOk(false);
                }}
                onBlur={() => setSubdomainTouched(true)}
                placeholder="wild-rooster"
              />
              <span className={styles.subdomainSuffix} aria-hidden="true">
                .{MENU_PUBLIC_DOMAIN}
              </span>
            </div>
            <p id="settings-subdomain-help" className={styles.subdomainHelp}>
              URL pública de tu menú digital. Debe ser único en toda la plataforma.
            </p>
            <p
              id="settings-subdomain-feedback"
              className={
                subdomainError
                  ? styles.subdomainFeedbackError
                  : subdomainChecking
                    ? styles.subdomainFeedbackPending
                    : subdomainTouched && subdomain && subdomain !== savedSubdomain
                      ? styles.subdomainFeedbackOk
                      : styles.subdomainFeedbackNeutral
              }
              role="status"
              aria-live="polite"
            >
              {subdomainChecking
                ? 'Comprobando disponibilidad…'
                : subdomainError
                  ? subdomainError
                  : subdomainTouched && subdomain && subdomain !== savedSubdomain
                    ? 'Subdominio disponible.'
                    : subdomainPreviewUrl
                      ? `Vista previa: ${subdomainPreviewUrl.replace(/^https:\/\//, '')}`
                      : `Ejemplo: tu-restaurante.${MENU_PUBLIC_DOMAIN}`}
            </p>
            {subdomainPreviewUrl ? (
              <a
                className={styles.subdomainPreviewBtn}
                href={subdomainPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir menú público
                <OpenInNewOutlinedIcon className={styles.subdomainPreviewBtnIcon} aria-hidden />
              </a>
            ) : null}
          </div>
          <label className={`${styles.label} ${styles.formGridFull}`}>
            Descripción
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSaveOk(false);
              }}
              placeholder="Breve descripción para tus clientes (opcional)"
            />
          </label>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="settings-whatsapp">
        <h2 id="settings-whatsapp" className={styles.panelTitle}>
          WhatsApp de pedidos
        </h2>
        <p className={styles.panelHint}>
          Tus pedidos llegarán a este número de WhatsApp. Asegúrate de que esté activo y puedas
          recibir mensajes.
        </p>

        <div className={`${styles.label} ${styles.phoneField}`}>
          <span id="settings-whatsapp-label">Número de WhatsApp</span>
          <PhoneInputWithCountry
            countryIso={whatsappCountryIso}
            localNumber={whatsappLocal}
            hint="Número donde recibirás pedidos por WhatsApp."
            onCountryChange={(iso) => {
              setWhatsappCountryIso(iso);
              setWhatsappTouched(true);
              setSaveOk(false);
            }}
            onLocalNumberChange={(value) => {
              setWhatsappLocal(value);
              setWhatsappTouched(true);
              setSaveOk(false);
            }}
          />
          {whatsappTouched && whatsappError ? (
            <p className={styles.fieldError} role="alert">
              {whatsappError}
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="settings-services">
        <h2 id="settings-services" className={styles.panelTitle}>
          Tipos de entrega
        </h2>
        <p className={styles.panelHint}>
          Controla qué modalidades ofrece tu restaurante en el menú y al recibir pedidos.
        </p>
        <div className={styles.toggleList}>
          <Toggle
            label={RESTAURANT_SERVICE_LABELS.takeout}
            hint="Recoger en el local"
            checked={takeoutEnabled}
            onChange={(next) => {
              setTakeoutEnabled(next);
              setSaveOk(false);
            }}
          />
          <Toggle
            label={RESTAURANT_SERVICE_LABELS.delivery}
            hint="Entrega a domicilio"
            checked={deliveryEnabled}
            onChange={(next) => {
              setDeliveryEnabled(next);
              setSaveOk(false);
            }}
          />
        </div>
        {deliveryEnabled ? (
          <DeliveryPartnershipStatus
            partnership={deliveryPartnership}
            loading={deliveryPartnershipLoading}
            requestError={deliveryPartnershipError}
          />
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="settings-payments">
        <h2 id="settings-payments" className={styles.panelTitle}>
          Métodos de pago
        </h2>
        <p className={styles.panelHint}>
          Habilita o deshabilita métodos de pago por tipo de entrega.
          {deliveryPartnershipActive
            ? ' Los métodos de entrega a domicilio los define tu proveedor de reparto.'
            : null}
        </p>
        <div className={styles.paymentGrid}>
          {(['takeout', 'delivery'] as const).map((serviceType) => {
            const serviceEnabled =
              serviceType === 'takeout' ? takeoutEnabled : deliveryEnabled;
            const providerManaged = serviceType === 'delivery' && deliveryPartnershipActive;
            return (
              <div key={serviceType} className={styles.paymentBlock}>
                <h3 className={styles.paymentBlockTitle}>{RESTAURANT_SERVICE_LABELS[serviceType]}</h3>
                <div className={styles.paymentRows}>
                  {PAYMENT_METHOD_ORDER.map((method) => (
                    <div key={method} className={styles.paymentRow}>
                      <span className={styles.paymentName}>{PAYMENT_METHOD_LABELS[method]}</span>
                      <Switch
                        checked={paymentMatrix[serviceType][method]}
                        disabled={!serviceEnabled || providerManaged}
                        ariaLabel={`${PAYMENT_METHOD_LABELS[method]} — ${RESTAURANT_SERVICE_LABELS[serviceType]}`}
                        onChange={(next) => setPaymentEnabled(serviceType, method, next)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="settings-location">
        <h2 id="settings-location" className={styles.panelTitle}>
          Ubicación
        </h2>
        <p className={styles.panelHint}>
          Busca tu negocio con Google Places (New), confirma la dirección y arrastra el pin en el
          mapa para marcar la entrada exacta.
        </p>

        <RestaurantPlaceAutocomplete onPlaceSelected={handlePlaceSelected} />

        <label className={styles.label}>
          Dirección
          <textarea
            className={`${styles.textarea} ${styles.addressTextarea}`}
            rows={2}
            value={location.address}
            onChange={(e) => {
              setLocation((prev) => ({ ...prev, address: e.target.value }));
              setSaveOk(false);
            }}
            placeholder="Calle, colonia, ciudad"
          />
        </label>

        <RestaurantLocationMapPicker
          ref={mapPickerRef}
          latitude={location.latitude}
          longitude={location.longitude}
          onLocationChange={handleMapLocationChange}
        />
      </section>

      <section className={styles.panel} aria-labelledby="settings-hours">
        <h2 id="settings-hours" className={styles.panelTitle}>
          Horarios de servicio
        </h2>
        <p className={styles.panelHint}>
          Configura el horario de recoger en tienda y consulta el de entrega a domicilio. Los
          cambios de horario se guardan aparte.
        </p>
        <div className={styles.hoursWrap}>
          {!hasScheduleContent ? (
            <p className={styles.empty}>
              Habilita recoger en tienda o entrega a domicilio para ver los horarios.
            </p>
          ) : (
            <DashboardRestaurantHours
              schedules={schedules}
              takeoutEnabled={takeoutEnabled}
              deliveryEnabled={deliveryEnabled}
              deliveryProviderSchedules={deliveryProviderSchedules}
              deliveryPartnershipActive={deliveryPartnershipActive}
              onSave={async (payload) => {
                if (!accessToken || !restaurantId) return;
                await setRestaurantSchedules(accessToken, restaurantId, payload);
                const updated = await listRestaurantSchedules(accessToken, restaurantId);
                setSchedules(updated);
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
