'use client';

import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { DashboardRestaurantHours } from '@/components/settings/DashboardRestaurantHours';
import { DeliveryPartnershipStatus } from '@/components/settings/DeliveryPartnershipStatus';
import { RestaurantLocationMapPicker } from '@/components/settings/RestaurantLocationMapPicker';
import type { RestaurantLocationMapPickerHandle } from '@/components/settings/RestaurantLocationMapPicker';
import { RestaurantPlaceAutocomplete } from '@/components/settings/RestaurantPlaceAutocomplete';
import type { MapLocationUpdate } from '@/lib/loadGoogleMapsPlaces';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import {
  addMyRestaurantAdminInvite,
  checkRestaurantSubdomainAvailability,
  getRestaurant,
  getRestaurantDeliveryPartnership,
  listMyRestaurantAdminInvites,
  listMyRestaurantMembers,
  listRestaurantPaymentMethods,
  listRestaurantSchedules,
  removeMyRestaurantAdminInvite,
  removeMyRestaurantAdminMember,
  setRestaurantPaymentMethods,
  setRestaurantSchedules,
  updateRestaurant,
} from '@/lib/api/restaurants';
import type {
  DeliveryProviderSchedule,
  Restaurant,
  RestaurantAdminInvite,
  RestaurantDeliveryPartnership,
  RestaurantMember,
  RestaurantSchedule,
} from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import {
  fetchActiveDeliveryProviderConfig,
  isActiveDeliveryPartnership,
} from '@/lib/fetchActiveDeliveryProviderConfig';
import {
  clampDeliveryMatrixToProviderAvailable,
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
  normalizeSubdomainDraft,
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

function memberPrimaryLabel(member: RestaurantMember): string {
  return member.display_name?.trim() || member.email?.trim() || 'Usuario sin nombre';
}

function memberSecondaryLabel(member: RestaurantMember): string | null {
  const email = member.email?.trim();
  const name = member.display_name?.trim();
  if (email && name && email.toLowerCase() !== name.toLowerCase()) return email;
  return null;
}

function formatMemberJoinedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function SettingsPage() {
  const { firebaseUser, accessToken, loading: authLoading } = useAuth();
  const {
    selectedRestaurantId,
    memberRole: accessMemberRole,
    loading: accessLoading,
  } = useRestaurantAccess();
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
  const [providerDeliveryAvailable, setProviderDeliveryAvailable] = useState<
    PaymentMethodMatrix['delivery'] | null
  >(null);
  const [schedules, setSchedules] = useState<RestaurantSchedule[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [whatsappCountryIso, setWhatsappCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [whatsappLocal, setWhatsappLocal] = useState('');
  const [whatsappTouched, setWhatsappTouched] = useState(false);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [adminMembers, setAdminMembers] = useState<RestaurantMember[]>([]);
  const [adminMembersLoading, setAdminMembersLoading] = useState(false);
  const [adminInvites, setAdminInvites] = useState<RestaurantAdminInvite[]>([]);
  const [adminInvitesLoading, setAdminInvitesLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [removingInviteId, setRemovingInviteId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading || accessLoading) return;
      if (!accessToken) {
        setLoadError('No hay sesión activa. Inicia sesión de nuevo.');
        setLoading(false);
        return;
      }
      if (!selectedRestaurantId) {
        setLoadError(
          'No tienes ningún restaurante asociado. Completa el registro inicial para continuar.',
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const rid = selectedRestaurantId;
        setMemberRole(accessMemberRole ?? null);
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
        let nextProviderDeliveryAvailable: PaymentMethodMatrix['delivery'] | null = null;

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
                nextProviderDeliveryAvailable = providerPaymentMethodsToDeliveryMatrix(
                  providerConfig.paymentMethods,
                );
                nextPaymentMatrix = {
                  ...nextPaymentMatrix,
                  delivery: clampDeliveryMatrixToProviderAvailable(
                    nextPaymentMatrix.delivery,
                    nextProviderDeliveryAvailable,
                  ),
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
          setProviderDeliveryAvailable(nextProviderDeliveryAvailable);
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
  }, [accessToken, accessLoading, accessMemberRole, authLoading, firebaseUser?.email, selectedRestaurantId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      if (!accessToken || memberRole !== 'owner') {
        setAdminMembers([]);
        setAdminInvites([]);
        return;
      }

      setAdminMembersLoading(true);
      setAdminInvitesLoading(true);
      setAdminError(null);

      try {
        const [members, invites] = await Promise.all([
          listMyRestaurantMembers(accessToken),
          listMyRestaurantAdminInvites(accessToken),
        ]);
        if (!cancelled) {
          setAdminMembers(members);
          setAdminInvites(invites);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setAdminError('No se pudieron cargar los administradores.');
        }
      } finally {
        if (!cancelled) {
          setAdminMembersLoading(false);
          setAdminInvitesLoading(false);
        }
      }
    }

    void loadAdminData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, memberRole]);

  useEffect(() => {
    if (!accessToken || !restaurantId || !subdomainTouched) return;

    if (subdomain.endsWith('-')) {
      setSubdomainError(null);
      setSubdomainChecking(false);
      setSubdomainVerified(false);
      return;
    }

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
          matrixToPaymentCreates(paymentMatrix),
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
        const deliveryJustEnabled = !restaurant?.delivery_enabled;
        try {
          const partnership = deliveryJustEnabled
            ? await syncRestaurantDeliveryPartnership(
                accessToken,
                restaurantId,
                updatedRestaurant.delivery_enabled,
              )
            : (await getRestaurantDeliveryPartnership(accessToken, restaurantId)).partnership;
          setDeliveryPartnership(partnership);
          if (isActiveDeliveryPartnership(partnership)) {
            const providerConfig = await fetchActiveDeliveryProviderConfig(
              accessToken,
              restaurantId,
              partnership,
            );
            if (providerConfig) {
              setDeliveryProviderSchedules(providerConfig.schedules);
              const available = providerPaymentMethodsToDeliveryMatrix(
                providerConfig.paymentMethods,
              );
              setProviderDeliveryAvailable(available);
              setPaymentMatrix((prev) => ({
                ...prev,
                delivery: clampDeliveryMatrixToProviderAvailable(prev.delivery, available),
              }));
            }
          } else {
            setDeliveryProviderSchedules(null);
            setProviderDeliveryAvailable(null);
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
        setProviderDeliveryAvailable(null);
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

  const handleAddAdmin = async () => {
    if (!accessToken) {
      setAdminError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    const trimmed = adminEmail.trim();
    if (!trimmed) {
      setAdminError('Escribe un correo electrónico.');
      return;
    }

    const normalized = trimmed.toLowerCase();
    if (
      adminMembers.some((member) => member.email?.trim().toLowerCase() === normalized)
    ) {
      setAdminError('Ese correo ya pertenece al equipo.');
      return;
    }
    if (adminInvites.some((invite) => invite.email.trim().toLowerCase() === normalized)) {
      setAdminError('Ese correo ya está en la lista de administradores.');
      return;
    }

    setAdminSaving(true);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      const created = await addMyRestaurantAdminInvite(accessToken, trimmed);
      setAdminInvites((current) => [...current, created]);
      setAdminEmail('');
      setAdminSuccess('Administrador agregado. Podrá entrar cuando inicie sesión con ese correo.');
      window.setTimeout(() => setAdminSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setAdminError(err.message);
      } else {
        setAdminError('No se pudo agregar el administrador.');
      }
    } finally {
      setAdminSaving(false);
    }
  };

  const handleRemoveAdminMember = async (memberId: string) => {
    if (!accessToken) {
      setAdminError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setRemovingMemberId(memberId);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      await removeMyRestaurantAdminMember(accessToken, memberId);
      setAdminMembers((current) => current.filter((member) => member.id !== memberId));
      setAdminSuccess('Administrador eliminado del equipo.');
      window.setTimeout(() => setAdminSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setAdminError(err.message);
      } else {
        setAdminError('No se pudo eliminar al administrador.');
      }
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleRemoveAdmin = async (inviteId: string) => {
    if (!accessToken) {
      setAdminError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setRemovingInviteId(inviteId);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      await removeMyRestaurantAdminInvite(accessToken, inviteId);
      setAdminInvites((current) => current.filter((invite) => invite.id !== inviteId));
      setAdminSuccess('Invitación eliminada.');
      window.setTimeout(() => setAdminSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setAdminError(err.message);
      } else {
        setAdminError('No se pudo eliminar la invitación.');
      }
    } finally {
      setRemovingInviteId(null);
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
                  setSubdomain(normalizeSubdomainDraft(e.target.value));
                  setSubdomainTouched(true);
                  setSubdomainVerified(false);
                  setSaveOk(false);
                }}
                onBlur={() => {
                  setSubdomainTouched(true);
                  setSubdomain(normalizeSubdomainInput(subdomain));
                }}
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
            ? ' Para entrega a domicilio solo puedes activar métodos que tu repartidor tenga disponibles.'
            : null}
        </p>
        <div className={styles.paymentGrid}>
          {(['takeout', 'delivery'] as const).map((serviceType) => {
            const serviceEnabled =
              serviceType === 'takeout' ? takeoutEnabled : deliveryEnabled;
            return (
              <div key={serviceType} className={styles.paymentBlock}>
                <h3 className={styles.paymentBlockTitle}>{RESTAURANT_SERVICE_LABELS[serviceType]}</h3>
                <div className={styles.paymentRows}>
                  {PAYMENT_METHOD_ORDER.map((method) => {
                    const courierOffersMethod =
                      serviceType !== 'delivery' ||
                      !deliveryPartnershipActive ||
                      (providerDeliveryAvailable?.[method] ?? false);
                    const rowDisabled = !serviceEnabled || !courierOffersMethod;
                    return (
                      <div key={method} className={styles.paymentRow}>
                        <div className={styles.paymentNameGroup}>
                          <span className={styles.paymentName}>{PAYMENT_METHOD_LABELS[method]}</span>
                          {serviceType === 'delivery' &&
                          deliveryPartnershipActive &&
                          !courierOffersMethod ? (
                            <span className={styles.paymentUnavailableHint}>
                              No disponible con tu repartidor
                            </span>
                          ) : null}
                        </div>
                        <Switch
                          checked={paymentMatrix[serviceType][method]}
                          disabled={rowDisabled}
                          ariaLabel={`${PAYMENT_METHOD_LABELS[method]} — ${RESTAURANT_SERVICE_LABELS[serviceType]}`}
                          onChange={(next) => setPaymentEnabled(serviceType, method, next)}
                        />
                      </div>
                    );
                  })}
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
            readOnly
            placeholder="Calle, colonia, ciudad"
            aria-readonly="true"
          />
        </label>

        <RestaurantLocationMapPicker
          ref={mapPickerRef}
          latitude={location.latitude}
          longitude={location.longitude}
          onLocationChange={handleMapLocationChange}
        />
      </section>

      {memberRole === 'owner' ? (
        <section className={styles.panel} aria-labelledby="settings-admins">
          <h2 id="settings-admins" className={styles.panelTitle}>
            Administradores
          </h2>
          <p className={styles.panelHint}>
            Solo puedes invitar correos que no sean propietarios de otro restaurante.
            Los administradores pueden pertenecer a varios restaurantes. No necesitan cuenta previa: al iniciar sesión con Google usando ese
            correo, entrarán directo al panel.
          </p>
          {adminError ? (
            <div className={styles.errorBanner} role="alert">
              {adminError}
            </div>
          ) : null}
          {adminSuccess ? (
            <div className={styles.successBanner} role="status">
              {adminSuccess}
            </div>
          ) : null}

          <div className={styles.adminSection}>
            <h3 className={styles.adminSectionTitle}>Equipo activo</h3>
            {adminMembersLoading ? (
              <p className={styles.loading} role="status">
                Cargando equipo…
              </p>
            ) : adminMembers.length === 0 ? (
              <p className={styles.empty}>Aún no hay administradores activos.</p>
            ) : (
              <ul className={styles.adminMemberList}>
                {adminMembers.map((member) => {
                  const secondary = memberSecondaryLabel(member);
                  const joinedAt = formatMemberJoinedAt(member.created_at);
                  const isOwner = member.member_role === 'owner';
                  return (
                    <li key={member.id} className={styles.adminMemberCard}>
                      <div className={styles.adminMemberAvatar} aria-hidden="true">
                        <PersonOutlineOutlinedIcon fontSize="small" />
                      </div>
                      <div className={styles.adminMemberBody}>
                        <div className={styles.adminMemberTopRow}>
                          <span className={styles.adminMemberName}>
                            {memberPrimaryLabel(member)}
                          </span>
                          <span
                            className={
                              isOwner ? styles.roleBadgeOwner : styles.roleBadgeAdmin
                            }
                          >
                            {isOwner ? (
                              <ShieldOutlinedIcon className={styles.roleBadgeIcon} />
                            ) : (
                              <PersonOutlineOutlinedIcon className={styles.roleBadgeIcon} />
                            )}
                            {isOwner ? 'Propietario' : 'Administrador'}
                          </span>
                        </div>
                        {secondary ? (
                          <span className={styles.adminMemberEmail}>{secondary}</span>
                        ) : null}
                        {joinedAt ? (
                          <span className={styles.adminMemberMeta}>
                            Acceso desde {joinedAt}
                          </span>
                        ) : null}
                      </div>
                      {memberRole === 'owner' && !isOwner ? (
                        <button
                          type="button"
                          className={styles.removeBtn}
                          disabled={removingMemberId === member.id}
                          onClick={() => void handleRemoveAdminMember(member.id)}
                        >
                          {removingMemberId === member.id ? 'Quitando…' : 'Quitar'}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={styles.adminSection}>
            <h3 className={styles.adminSectionTitle}>Invitar administrador</h3>
            <div className={styles.adminAddRow}>
              <input
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="correo@empresa.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddAdmin();
                  }
                }}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={adminSaving || adminInvitesLoading || adminMembersLoading}
                onClick={() => void handleAddAdmin()}
              >
                {adminSaving ? 'Agregando…' : 'Agregar'}
              </button>
            </div>
          </div>

          <div className={styles.adminSection}>
            <h3 className={styles.adminSectionTitle}>Invitaciones pendientes</h3>
            {adminInvitesLoading ? (
              <p className={styles.loading} role="status">
                Cargando invitaciones…
              </p>
            ) : adminInvites.length === 0 ? (
              <p className={styles.empty}>No hay invitaciones pendientes.</p>
            ) : (
              <ul className={styles.adminList}>
                {adminInvites.map((invite) => (
                  <li key={invite.id} className={styles.adminListItem}>
                    <div className={styles.adminInviteMain}>
                      <MailOutlineOutlinedIcon
                        className={styles.adminInviteIcon}
                        aria-hidden="true"
                      />
                      <div className={styles.adminInviteText}>
                        <span className={styles.adminEmail}>{invite.email}</span>
                        <span className={styles.adminInviteMeta}>
                          Esperando primer inicio de sesión
                        </span>
                      </div>
                      <span className={styles.roleBadgePending}>Pendiente</span>
                    </div>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      disabled={removingInviteId === invite.id}
                      onClick={() => void handleRemoveAdmin(invite.id)}
                    >
                      {removingInviteId === invite.id ? 'Quitando…' : 'Quitar'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

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
