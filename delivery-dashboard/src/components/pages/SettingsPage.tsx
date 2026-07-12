'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { DeliveryProviderHoursEditor } from '@/components/settings/DeliveryProviderHoursEditor';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { ServiceZoneMapDrawer } from '@/components/onboarding/ServiceZoneMapDrawer';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useAuth } from '@/hooks/useAuth';
import {
  addMyDeliveryProviderAdminInvite,
  getMyDeliveryProvider,
  listMyDeliveryProviderAdminInvites,
  listMyDeliveryProviderMembers,
  listMyDeliveryProviderPaymentMethods,
  listMyDeliveryProviderSchedules,
  removeMyDeliveryProviderAdminInvite,
  setMyDeliveryProviderPaymentMethods,
  setMyDeliveryProviderSchedules,
  updateMyDeliveryProvider,
} from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import type { DeliveryProviderAdminInvite, DeliveryProviderMember } from '@/lib/api/types';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';
import { createDefaultOnboardingData } from '@/lib/onboarding/defaults';
import type { OnboardingData } from '@/lib/onboarding/types';
import type { DeliveryProviderSchedule } from '@/lib/api/types';
import {
  buildProfileUpdatePayload,
  providerProfileFromApi,
  validateProviderProfile,
} from '@/lib/settings/providerProfile';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import {
  createDefaultPaymentState,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  paymentMethodsToState,
  stateToPaymentUpdates,
  type PaymentMethodKey,
  type PaymentMethodState,
} from '@/lib/payment/providerPaymentConfig';
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

function formatMemberJoinedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function memberPrimaryLabel(member: DeliveryProviderMember): string {
  return member.display_name?.trim() || member.email?.trim() || 'Usuario sin nombre';
}

function memberSecondaryLabel(member: DeliveryProviderMember): string | null {
  const email = member.email?.trim();
  const name = member.display_name?.trim();
  if (email && name && email.toLowerCase() !== name.toLowerCase()) return email;
  return null;
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
  const [schedules, setSchedules] = useState<DeliveryProviderSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedulesSaving, setSchedulesSaving] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentMethodState>(createDefaultPaymentState);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsSaving, setPaymentsSaving] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [adminMembers, setAdminMembers] = useState<DeliveryProviderMember[]>([]);
  const [adminMembersLoading, setAdminMembersLoading] = useState(false);
  const [adminInvites, setAdminInvites] = useState<DeliveryProviderAdminInvite[]>([]);
  const [adminInvitesLoading, setAdminInvitesLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [removingInviteId, setRemovingInviteId] = useState<string | null>(null);

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
        setMemberRole(response.member_role ?? null);
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
          listMyDeliveryProviderMembers(accessToken),
          listMyDeliveryProviderAdminInvites(accessToken),
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
    let cancelled = false;

    async function loadSchedules() {
      if (!accessToken) return;
      setSchedulesLoading(true);
      setScheduleError(null);

      try {
        const rows = await listMyDeliveryProviderSchedules(accessToken);
        if (!cancelled) setSchedules(rows);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setScheduleError('No se pudieron cargar los horarios de reparto.');
        }
      } finally {
        if (!cancelled) setSchedulesLoading(false);
      }
    }

    void loadSchedules();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadPayments() {
      if (!accessToken) return;
      setPaymentsLoading(true);
      setPaymentError(null);

      try {
        const rows = await listMyDeliveryProviderPaymentMethods(accessToken);
        if (!cancelled) {
          setPaymentState(
            rows.length > 0 ? paymentMethodsToState(rows) : createDefaultPaymentState(),
          );
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPaymentError('No se pudieron cargar los métodos de pago.');
        }
      } finally {
        if (!cancelled) setPaymentsLoading(false);
      }
    }

    void loadPayments();
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

  const handleSaveSchedules = async (payload: Parameters<typeof setMyDeliveryProviderSchedules>[1]) => {
    if (!accessToken) {
      setScheduleError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setSchedulesSaving(true);
    setScheduleError(null);
    setScheduleSuccess(null);

    try {
      await setMyDeliveryProviderSchedules(accessToken, payload);
      const updated = await listMyDeliveryProviderSchedules(accessToken);
      setSchedules(updated);
      setScheduleSuccess('Horarios guardados correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setScheduleError(err.message);
      } else {
        setScheduleError('No se pudieron guardar los horarios. Intenta de nuevo.');
      }
    } finally {
      setSchedulesSaving(false);
    }
  };

  const handlePaymentToggle = async (method: PaymentMethodKey, enabled: boolean) => {
    if (!accessToken) {
      setPaymentError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    const previous = paymentState;
    const nextState = { ...paymentState, [method]: enabled };
    setPaymentsSaving(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      const updated = await setMyDeliveryProviderPaymentMethods(
        accessToken,
        stateToPaymentUpdates(nextState),
      );
      setPaymentState(paymentMethodsToState(updated));
      setPaymentSuccess('Métodos de pago actualizados.');
      window.setTimeout(() => setPaymentSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setPaymentState(previous);
      if (err instanceof ApiError) {
        setPaymentError(err.message);
      } else {
        setPaymentError('No se pudieron guardar los métodos de pago.');
      }
    } finally {
      setPaymentsSaving(false);
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
      const created = await addMyDeliveryProviderAdminInvite(accessToken, trimmed);
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

  const handleRemoveAdmin = async (inviteId: string) => {
    if (!accessToken) {
      setAdminError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setRemovingInviteId(inviteId);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      await removeMyDeliveryProviderAdminInvite(accessToken, inviteId);
      setAdminInvites((current) => current.filter((invite) => invite.id !== inviteId));
      setAdminSuccess('Administrador eliminado.');
      window.setTimeout(() => setAdminSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setAdminError(err.message);
      } else {
        setAdminError('No se pudo eliminar el administrador.');
      }
    } finally {
      setRemovingInviteId(null);
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

          {memberRole === 'owner' ? (
            <section className={styles.panel} aria-labelledby="settings-admins">
              <h2 id="settings-admins" className={styles.panelTitle}>
                Administradores
              </h2>
              <p className={styles.panelHint}>
                Consulta quién tiene acceso al panel y agrega correos para nuevos
                administradores. No necesitan cuenta previa: al iniciar sesión con Google
                usando ese correo, entrarán directo al panel.
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

          <section className={styles.panel} aria-labelledby="settings-payments">
            <h2 id="settings-payments" className={styles.panelTitle}>
              Métodos de pago
            </h2>
            <p className={styles.panelHint}>
              Indica qué formas de pago aceptas al cobrar la entrega al cliente.
            </p>
            {paymentError ? (
              <div className={styles.errorBanner} role="alert">
                {paymentError}
              </div>
            ) : null}
            {paymentSuccess ? (
              <div className={styles.successBanner} role="status">
                {paymentSuccess}
              </div>
            ) : null}
            {paymentsLoading ? (
              <p className={styles.loading} role="status">
                Cargando métodos de pago…
              </p>
            ) : (
              <div className={styles.paymentGrid}>
                <div className={styles.paymentBlock}>
                  <h3 className={styles.paymentBlockTitle}>Cobro en entrega</h3>
                  <div className={styles.paymentRows}>
                    {PAYMENT_METHOD_ORDER.map((method) => (
                      <div key={method} className={styles.paymentRow}>
                        <span className={styles.paymentName}>{PAYMENT_METHOD_LABELS[method]}</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={paymentState[method]}
                            disabled={paymentsSaving}
                            aria-label={PAYMENT_METHOD_LABELS[method]}
                            onChange={(event) => {
                              void handlePaymentToggle(method, event.target.checked);
                            }}
                          />
                          <span className={styles.slider} aria-hidden />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {paymentsSaving ? (
              <p className={styles.savingHint} role="status">
                Guardando métodos de pago…
              </p>
            ) : null}
          </section>

          <section className={styles.panel} aria-labelledby="settings-hours">
            <h2 id="settings-hours" className={styles.panelTitle}>
              Horarios de reparto
            </h2>
            <p className={styles.panelHint}>
              Configura tu horario diurno y nocturno. El turno nocturno solo aplica dentro de tu
              polígono de cobertura; fuera de él solo cuenta el horario diurno.
            </p>
            {scheduleError ? (
              <div className={styles.errorBanner} role="alert">
                {scheduleError}
              </div>
            ) : null}
            {scheduleSuccess ? (
              <div className={styles.successBanner} role="status">
                {scheduleSuccess}
              </div>
            ) : null}
            {schedulesLoading ? (
              <p className={styles.loading} role="status">
                Cargando horarios…
              </p>
            ) : (
              <div className={styles.hoursWrap}>
                <DeliveryProviderHoursEditor
                  schedules={schedules}
                  saving={schedulesSaving}
                  onSave={handleSaveSchedules}
                />
              </div>
            )}
          </section>
        </>
      )}
    </PanelPageShell>
  );
}
