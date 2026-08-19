'use client';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeliveryLocationValue } from '@/components/digital-menu/CheckoutDeliveryAddressPicker';
import { DispatchCostBreakdown } from '@/components/dispatch/DispatchCostBreakdown';
import { DispatchDeliveryAddressPicker } from '@/components/dispatch/DispatchDeliveryAddressPicker';
import { DispatchRecentRequests } from '@/components/dispatch/DispatchRecentRequests';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { FormSelect } from '@/components/ui/FormSelect';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  cancelDispatchRequest,
  confirmDispatchCash,
  createDispatchRequest,
  listDispatchLeadTimes,
  listDispatchRequests,
  resolveDispatchMapsUrl,
  retryDispatchRequest,
  type DispatchCreateInput,
  type DispatchRequest,
  formatDispatchShortId,
  isDispatchHistoryStatus,
} from '@/lib/api/dispatch';
import { getPublicCheckoutConfig, type PublicDeliveryService } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import { getRestaurant } from '@/lib/api/restaurants';
import { formatMoney } from '@/lib/currency';
import { getDeliveryWeatherNotice } from '@/lib/digital-menu/checkout/deliveryWeatherNotice';
import { usePublicDeliveryQuote } from '@/lib/digital-menu/checkout/usePublicDeliveryQuote';
import {
  useRestaurantDispatchSocket,
  type RestaurantDispatchSocketStatus,
} from '@/lib/dispatch/useRestaurantDispatchSocket';
import { isActiveDeliveryPartnership } from '@/lib/fetchActiveDeliveryProviderConfig';
import { DEFAULT_COUNTRY_ISO, findCountryByIso, formatE164 } from '@/lib/phone/countryDialCodes';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import styles from './DeliveryPage.module.css';

const PREP_CUSTOM_VALUE = 'custom';

const EMPTY_LOCATION: DeliveryLocationValue = {
  address: '',
  latitude: null,
  longitude: null,
  placeId: null,
};

function parsePesosToCents(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return Math.round(Number(trimmed) * 100);
}

const LIVE_COPY: Record<
  RestaurantDispatchSocketStatus,
  { label: string; hint: string; tone: 'live' | 'pending' | 'muted' }
> = {
  live: {
    label: 'En vivo',
    hint: 'Las solicitudes se actualizan automáticamente',
    tone: 'live',
  },
  connecting: {
    label: 'Conectando',
    hint: 'Estableciendo enlace en tiempo real',
    tone: 'pending',
  },
  reconnecting: {
    label: 'Reconectando',
    hint: 'Sincronizando solicitudes al restablecer la conexión',
    tone: 'pending',
  },
  offline: {
    label: 'Sin enlace',
    hint: 'No hay conexión en tiempo real',
    tone: 'muted',
  },
};

function shareTrackingWhatsApp(shortId: string, url: string) {
  const text = `Rastrea tu entrega ${shortId}\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export default function DeliveryPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();
  const [subdomain, setSubdomain] = useState('');
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [leadTimes, setLeadTimes] = useState<number[]>([]);
  const [deliveryService, setDeliveryService] = useState<PublicDeliveryService | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DispatchRequest | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'cancel' | 'cash';
    request: DispatchRequest;
    step: 1 | 2;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [location, setLocation] = useState<DeliveryLocationValue>(EMPTY_LOCATION);
  const [mapsUrl, setMapsUrl] = useState<string | null>(null);
  const [addressReferences, setAddressReferences] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<DispatchCreateInput['payment_method']>('cash');
  const [packageSize, setPackageSize] = useState<'normal' | 'grande'>('normal');
  const [packageCount, setPackageCount] = useState('1');
  const [prepSelection, setPrepSelection] = useState('');
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');
  const [collectAmount, setCollectAmount] = useState('0');
  const [cashDenomination, setCashDenomination] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phoneCountryIso, setPhoneCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [phoneLocal, setPhoneLocal] = useState('');
  const [formExpanded, setFormExpanded] = useState(true);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [socketStatus, setSocketStatus] = useState<RestaurantDispatchSocketStatus>('offline');
  const [listView, setListView] = useState<'active' | 'history'>('active');
  const didInitFormCollapse = useRef(false);

  const courierAvailable = deliveryService?.available ?? false;
  const courierReason = deliveryService?.reason ?? null;

  const prepMinutes = useMemo(() => {
    if (prepSelection === PREP_CUSTOM_VALUE) {
      const parsed = Number(customPrepMinutes);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    }
    const parsed = Number(prepSelection);
    return Number.isFinite(parsed) ? parsed : null;
  }, [customPrepMinutes, prepSelection]);

  const prepValid =
    prepMinutes != null && prepMinutes >= 1 && prepMinutes < 60 && Number.isInteger(prepMinutes);

  const quoteEnabled =
    courierAvailable &&
    subdomain.length > 0 &&
    location.latitude != null &&
    location.longitude != null;

  const { quote: deliveryQuote, loading: deliveryQuoteLoading, error: deliveryQuoteError } =
    usePublicDeliveryQuote({
      subdomain,
      enabled: quoteEnabled,
      latitude: location.latitude,
      longitude: location.longitude,
    });

  const deliveryBlockingReason = deliveryQuoteError ?? deliveryQuote?.reason ?? null;
  const deliveryWeatherFeeNotice =
    deliveryQuote?.available === true
      ? getDeliveryWeatherNotice(deliveryQuote.weather_mode, 'fee')
      : null;
  const deliveryWeatherBlockedNotice =
    deliveryQuote?.available === false
      ? getDeliveryWeatherNotice(deliveryQuote.weather_mode, 'blocked')
      : null;

  const resolveMapsUrlForPicker = useCallback(
    async (url: string) => {
      if (!accessToken || !selectedRestaurantId) {
        throw new Error('Sesión no disponible');
      }
      const resolved = await resolveDispatchMapsUrl(accessToken, selectedRestaurantId, url);
      return { latitude: resolved.latitude, longitude: resolved.longitude };
    },
    [accessToken, selectedRestaurantId],
  );

  const load = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const restaurant = await getRestaurant(accessToken, selectedRestaurantId);
      const partnership = await syncRestaurantDeliveryPartnership(
        accessToken,
        selectedRestaurantId,
        restaurant.delivery_enabled,
      );
      if (!isActiveDeliveryPartnership(partnership)) {
        setError('No tienes un repartidor activo');
        setRequests([]);
        setLeadTimes([]);
        setDeliveryService(null);
        return;
      }

      const [rows, times, checkoutConfig] = await Promise.all([
        listDispatchRequests(accessToken, selectedRestaurantId),
        listDispatchLeadTimes(accessToken, selectedRestaurantId),
        getPublicCheckoutConfig(restaurant.subdomain),
      ]);

      const minutes = times.map((item) => item.prep_minutes);
      setSubdomain(restaurant.subdomain);
      setRequests(rows);
      setLeadTimes(minutes);
      setDeliveryService(checkoutConfig.delivery_service);
      setPrepSelection((current) => {
        if (current && (current === PREP_CUSTOM_VALUE || minutes.includes(Number(current)))) {
          return current;
        }
        return minutes[0] != null ? String(minutes[0]) : PREP_CUSTOM_VALUE;
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'No se pudo cargar Delivery.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId]);

  const refreshRequests = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) return;
    try {
      const rows = await listDispatchRequests(accessToken, selectedRestaurantId);
      setRequests(rows);
      setCreated((current) => {
        if (!current) return current;
        return rows.find((item) => item.id === current.id) ?? current;
      });
    } catch {
      /* keep the current list until the next successful refresh */
    }
  }, [accessToken, selectedRestaurantId]);

  useRestaurantDispatchSocket(selectedRestaurantId, accessToken, {
    onEvent: () => {
      void refreshRequests();
    },
    onStatusChange: setSocketStatus,
    onReconnect: () => {
      void refreshRequests();
    },
  });

  useEffect(() => {
    if (loading || didInitFormCollapse.current) return;
    if (requests.length > 0) {
      setFormExpanded(false);
      didInitFormCollapse.current = true;
    }
  }, [loading, requests.length]);

  useEffect(() => {
    if (authLoading || accessLoading) return;
    if (!accessToken || !selectedRestaurantId) return;
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [accessLoading, accessToken, authLoading, load, selectedRestaurantId]);

  const trackingUrl = useMemo(
    () =>
      created && subdomain
        ? `${publicMenuOrigin(subdomain)}/rastreo/${created.tracking_token}`
        : null,
    [created, subdomain],
  );

  const restaurantCollectCents = parsePesosToCents(collectAmount);
  const quotedDeliveryCents =
    deliveryQuote?.available === true ? deliveryQuote.delivery_fee_cents : 0;

  const activeRequests = useMemo(
    () => requests.filter((item) => !isDispatchHistoryStatus(item.status)),
    [requests],
  );
  const historyRequests = useMemo(
    () => requests.filter((item) => isDispatchHistoryStatus(item.status)),
    [requests],
  );
  const createdIsOpen = created != null && !isDispatchHistoryStatus(created.status);
  const liveCopy = LIVE_COPY[socketStatus];
  const liveDotClass =
    liveCopy.tone === 'live'
      ? styles.liveDotLive
      : liveCopy.tone === 'pending'
        ? styles.liveDotPending
        : styles.liveDotMuted;

  const paymentOptions = useMemo(
    () => [
      { value: 'cash', label: 'Efectivo' },
      { value: 'transfer', label: 'Transferencia' },
      { value: 'card_terminal', label: 'Terminal' },
    ],
    [],
  );

  const packageSizeOptions = useMemo(
    () => [
      { value: 'normal', label: 'Normal' },
      { value: 'grande', label: 'Grande' },
    ],
    [],
  );

  const prepOptions = useMemo(
    () => [
      ...leadTimes.map((minutes) => ({
        value: String(minutes),
        label: `${minutes} minutos`,
      })),
      { value: PREP_CUSTOM_VALUE, label: 'Personalizado' },
    ],
    [leadTimes],
  );

  const deliveryQuoteReady =
    deliveryQuote != null &&
    deliveryQuote.available === true &&
    Number.isFinite(deliveryQuote.delivery_fee_cents) &&
    deliveryQuote.delivery_fee_cents >= 0 &&
    !deliveryQuoteLoading &&
    !deliveryQuoteError;

  const canRequestRider =
    courierAvailable &&
    location.latitude != null &&
    location.longitude != null &&
    location.address.trim().length > 0 &&
    deliveryQuoteReady &&
    prepValid &&
    Number(packageCount) >= 1 &&
    !submitting;

  const formSummary = customerName.trim()
    ? `${customerName.trim()}${phoneLocal ? ` · ${phoneLocal}` : ''}`
    : 'Nombre, celular y dirección del cliente';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedRestaurantId || !canRequestRider || prepMinutes == null) return;

    if (
      !deliveryQuote?.available ||
      !Number.isFinite(deliveryQuote.delivery_fee_cents)
    ) {
      setError('Espera a que se calcule el costo de envío para esta ubicación.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = customerName.trim();
    const customerPhone = formatE164(
      findCountryByIso(phoneCountryIso).dialCode,
      phoneLocal,
    );
    if (!name || phoneLocal.replace(/\D/g, '').length < 8) {
      setError('Completa el nombre y celular del cliente.');
      return;
    }

    const references = addressReferences.trim();
    const dropoffAddress = references
      ? `${location.address.trim()} · ${references}`
      : location.address.trim();

    let collectCents = 0;
    let cashDenominationCents: number | null = null;

    if (paymentMethod === 'cash') {
      collectCents = parsePesosToCents(collectAmount);
      cashDenominationCents = parsePesosToCents(cashDenomination);
      if (!cashDenomination.trim()) {
        setError('Indica con qué billete o moneda pagará el cliente.');
        return;
      }
      if (cashDenominationCents < collectCents) {
        setError('La denominación debe cubrir el monto a cobrar.');
        return;
      }
    } else if (paymentMethod === 'card_terminal') {
      collectCents = parsePesosToCents(collectAmount);
    }

    setSubmitting(true);
    setError(null);
    try {
      const row = await createDispatchRequest(accessToken, selectedRestaurantId, {
        customer_name: name,
        customer_phone: customerPhone,
        dropoff_lat: location.latitude,
        dropoff_lng: location.longitude,
        dropoff_address: dropoffAddress,
        dropoff_maps_url: mapsUrl,
        payment_method: paymentMethod,
        collect_cents: collectCents,
        cash_denomination_cents: cashDenominationCents,
        package_size: packageSize,
        package_count: Number(packageCount),
        prep_minutes: prepMinutes,
        notes: String(form.get('notes') ?? '').trim() || null,
      });
      setCreated(row);
      setCopiedTracking(false);
      setRequests((current) => [row, ...current]);
      setLocation(EMPTY_LOCATION);
      setMapsUrl(null);
      setAddressReferences('');
      setPaymentMethod('cash');
      setPackageSize('normal');
      setPackageCount('1');
      setCollectAmount('0');
      setCashDenomination('');
      setCustomPrepMinutes('');
      setCustomerName('');
      setPhoneCountryIso(DEFAULT_COUNTRY_ISO);
      setPhoneLocal('');
      setFormExpanded(false);
      if (leadTimes[0] != null) {
        setPrepSelection(String(leadTimes[0]));
      }
      event.currentTarget.reset();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No se pudo solicitar el delivery.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(
    request: DispatchRequest,
    action: 'retry' | 'cancel' | 'cash',
  ): Promise<boolean> {
    if (!accessToken || !selectedRestaurantId) return false;
    setError(null);
    try {
      const updated =
        action === 'cancel'
          ? await cancelDispatchRequest(accessToken, selectedRestaurantId, request.id)
          : action === 'retry'
            ? await retryDispatchRequest(accessToken, selectedRestaurantId, request.id)
            : await confirmDispatchCash(accessToken, selectedRestaurantId, request.id);
      setRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      return true;
    } catch (actionError) {
      setError(
        actionError instanceof ApiError ? actionError.message : 'No se pudo actualizar la solicitud.',
      );
      return false;
    }
  }

  async function finishConfirm() {
    if (!confirm) return;
    setConfirming(true);
    try {
      const ok = await runAction(confirm.request, confirm.kind);
      if (ok) setConfirm(null);
    } finally {
      setConfirming(false);
    }
  }

  async function copyCreatedTracking() {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedTracking(true);
      window.setTimeout(() => setCopiedTracking(false), 2000);
    } catch {
      window.prompt('Copia el enlace de rastreo', trackingUrl);
    }
  }

  const confirmCopy = confirm
    ? confirm.kind === 'cancel'
      ? confirm.step === 1
        ? {
            title: `¿Cancelar el envío ${formatDispatchShortId(confirm.request.short_id)}?`,
            description:
              'Se detendrá la búsqueda de repartidor y el cliente dejará de ver el rastreo activo.\n\nEsta acción no se puede deshacer.',
            confirmLabel: 'Continuar',
            cancelLabel: 'No, conservar',
            variant: 'danger' as const,
          }
        : {
            title: 'Confirma la cancelación',
            description: `Vas a cancelar ${formatDispatchShortId(confirm.request.short_id)} de ${confirm.request.customer_name}. El pedido no se asignará a ningún rider.`,
            confirmLabel: 'Sí, cancelar envío',
            cancelLabel: 'Volver',
            variant: 'danger' as const,
          }
      : confirm.step === 1
        ? {
            title: '¿El rider ya te pagó?',
            description:
              'Esto libera el crédito retenido al repartidor.\n\nConfírmalo solo si ya recibiste el efectivo en tu negocio.',
            confirmLabel: 'Continuar',
            cancelLabel: 'Todavía no',
            variant: 'primary' as const,
          }
        : {
            title: 'Confirma el pago',
            description: `Vas a marcar que el rider ya te entregó el cobro de ${formatDispatchShortId(confirm.request.short_id)} (${formatMoney(confirm.request.collect_cents / 100, 'MXN')}).`,
            confirmLabel: 'Sí, ya me pagó',
            cancelLabel: 'Volver',
            variant: 'primary' as const,
          }
    : null;

  if (loading || authLoading || accessLoading) {
    return <p className={styles.loading}>Cargando Delivery…</p>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Delivery</h1>
          <p>Solicita un repartidor para una entrega creada fuera del menú digital.</p>
        </div>
        <div
          className={styles.liveIndicator}
          role="status"
          aria-live="polite"
          aria-label={`${liveCopy.label}. ${liveCopy.hint}`}
          title={liveCopy.hint}
        >
          <span className={`${styles.liveDot} ${liveDotClass}`} aria-hidden />
          <span className={styles.liveLabel}>{liveCopy.label}</span>
        </div>
      </header>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {!courierAvailable ? (
        <div className={styles.serviceAlert} role="alert">
          {courierReason ?? 'El servicio de reparto de Mexy no está disponible en este momento.'}
        </div>
      ) : null}

      <section
        className={`${styles.formSection} ${formExpanded ? styles.formSectionOpen : ''}`}
        aria-labelledby="new-delivery-title"
      >
        <button
          type="button"
          className={styles.formToggle}
          aria-expanded={formExpanded}
          aria-controls="new-delivery-panel"
          onClick={() => setFormExpanded((open) => !open)}
        >
          <span className={styles.formToggleLead}>
            <DeliveryDiningOutlinedIcon className={styles.formToggleIcon} aria-hidden />
            <span className={styles.formToggleMain}>
              <h2 id="new-delivery-title" className={styles.formTitle}>
                Solicitar delivery
              </h2>
              {!formExpanded ? (
                <span className={styles.formSummary}>{formSummary}</span>
              ) : null}
            </span>
          </span>
          <span
            className={`${styles.formChevron} ${formExpanded ? styles.formChevronExpanded : ''}`}
            aria-hidden
          >
            <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} />
          </span>
        </button>

        <div id="new-delivery-panel" className={styles.formPanel} hidden={!formExpanded}>
          <p className={styles.formSubtitle}>
            Completa los datos del cliente, cobro y paquete.
          </p>
          <form className={styles.form} onSubmit={submit}>
          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="customer-name">
                Nombre del cliente
              </label>
              <input
                id="customer-name"
                name="customer_name"
                className={styles.input}
                required
                maxLength={200}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                disabled={!courierAvailable}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="customer-phone">
                Celular
              </label>
              <PhoneInputWithCountry
                inputId="customer-phone"
                countryIso={phoneCountryIso}
                localNumber={phoneLocal}
                onCountryChange={setPhoneCountryIso}
                onLocalNumberChange={setPhoneLocal}
                placeholder="55 1234 5678"
                disabled={!courierAvailable}
                flat
              />
            </div>
          </div>

          <DispatchDeliveryAddressPicker
            value={location}
            mapsUrl={mapsUrl}
            onChange={setLocation}
            onMapsUrlChange={setMapsUrl}
            resolveMapsUrl={resolveMapsUrlForPicker}
            disabled={!courierAvailable}
          />

          <div className={styles.field}>
            <label className={styles.label} htmlFor="address-references">
              Referencias de dirección
              <span className={styles.optional}> (opcional)</span>
            </label>
            <input
              id="address-references"
              className={styles.input}
              value={addressReferences}
              onChange={(event) => setAddressReferences(event.target.value)}
              placeholder="Ej. puerta color blanca, junto a la farmacia"
              maxLength={200}
              disabled={!courierAvailable}
            />
          </div>

          {deliveryQuoteLoading ? (
            <p className={styles.quoteStatus} role="status">
              Validando cobertura y calculando envío…
            </p>
          ) : null}

          {deliveryBlockingReason && location.latitude != null ? (
            <p className={styles.quoteAlert} role="alert">
              {deliveryWeatherBlockedNotice ?? deliveryBlockingReason}
            </p>
          ) : null}

          <div className={styles.gridThree}>
            <div className={styles.field}>
              <span className={styles.label} id="payment-method-label">
                Forma de pago
              </span>
              <FormSelect
                id="payment-method"
                value={paymentMethod}
                options={paymentOptions}
                onChange={(value) =>
                  setPaymentMethod(value as DispatchCreateInput['payment_method'])
                }
                disabled={!courierAvailable}
                aria-labelledby="payment-method-label"
              />
            </div>

            {paymentMethod !== 'transfer' ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="collect-amount">
                  Monto del restaurante
                </label>
                <input
                  id="collect-amount"
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={collectAmount}
                  onChange={(event) => setCollectAmount(event.target.value)}
                  disabled={!courierAvailable}
                />
                <p className={styles.fieldHint}>Sin incluir el costo de envío.</p>
              </div>
            ) : null}

            {paymentMethod === 'cash' ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="cash-denomination">
                  ¿Con cuánto paga?
                </label>
                <input
                  id="cash-denomination"
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={cashDenomination}
                  onChange={(event) => setCashDenomination(event.target.value)}
                  disabled={!courierAvailable}
                />
              </div>
            ) : null}
          </div>

          {deliveryQuote?.available && location.latitude != null ? (
            <DispatchCostBreakdown
              restaurantCents={paymentMethod === 'transfer' ? 0 : restaurantCollectCents}
              deliveryCents={quotedDeliveryCents}
              paymentMethod={paymentMethod}
              hint={
                deliveryQuote.inside_polygon
                  ? 'Restaurante es lo que cobra tu negocio. Envío es la tarifa de Mexy.'
                  : deliveryQuote.distance_km != null
                    ? `${deliveryQuote.distance_km.toFixed(1)} km de ruta · solo horario diurno`
                    : 'Fuera del polígono de cobertura · solo horario diurno'
              }
              weatherNotice={
                deliveryWeatherFeeNotice ? (
                  <p className={styles.weatherNotice}>
                    <WaterDropOutlinedIcon className={styles.weatherIcon} aria-hidden />
                    <span>{deliveryWeatherFeeNotice}</span>
                  </p>
                ) : null
              }
            />
          ) : null}

          <div className={styles.gridThree}>
            <div className={styles.field}>
              <span className={styles.label} id="package-size-label">
                Tamaño del paquete mayor
              </span>
              <FormSelect
                id="package-size"
                value={packageSize}
                options={packageSizeOptions}
                onChange={(value) => setPackageSize(value as 'normal' | 'grande')}
                disabled={!courierAvailable}
                aria-labelledby="package-size-label"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="package-count">
                Número de paquetes
              </label>
              <input
                id="package-count"
                className={styles.input}
                type="number"
                min="1"
                required
                value={packageCount}
                onChange={(event) => setPackageCount(event.target.value)}
                disabled={!courierAvailable}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label} id="prep-minutes-label">
                Listo en
              </span>
              <FormSelect
                id="prep-minutes"
                value={prepSelection}
                options={prepOptions}
                onChange={setPrepSelection}
                disabled={!courierAvailable || prepOptions.length === 0}
                aria-labelledby="prep-minutes-label"
              />
            </div>
          </div>

          {prepSelection === PREP_CUSTOM_VALUE ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="custom-prep-minutes">
                Minutos personalizados
              </label>
              <input
                id="custom-prep-minutes"
                className={styles.input}
                type="number"
                min="1"
                max="59"
                step="1"
                required
                value={customPrepMinutes}
                onChange={(event) => setCustomPrepMinutes(event.target.value)}
                placeholder="Menor a 60"
                disabled={!courierAvailable}
              />
              {!prepValid && customPrepMinutes.trim() ? (
                <p className={styles.fieldHint} role="alert">
                  Usa un número entero entre 1 y 59 minutos.
                </p>
              ) : null}
            </div>
          ) : null}

          <p className={styles.weightNotice}>Máximo 20 kg en la suma de todos los paquetes.</p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="driver-notes">
              Notas para el repartidor
            </label>
            <textarea
              id="driver-notes"
              name="notes"
              className={styles.textarea}
              maxLength={500}
              rows={3}
              disabled={!courierAvailable}
            />
          </div>

          <button
            className={styles.primaryButton}
            type="submit"
            disabled={!canRequestRider}
          >
            {submitting ? 'Solicitando…' : 'Solicitar repartidor'}
          </button>
        </form>
        </div>
      </section>

      {createdIsOpen && trackingUrl ? (
        <section className={styles.success} aria-live="polite">
          <div className={styles.successMark} aria-hidden>
            <CheckOutlinedIcon fontSize="small" />
          </div>
          <div className={styles.successBody}>
            <div className={styles.successHeading}>
              <h2>Pedido {formatDispatchShortId(created.short_id)} solicitado</h2>
              <button
                type="button"
                className={styles.successDismiss}
                aria-label="Cerrar aviso"
                onClick={() => setCreated(null)}
              >
                <CloseOutlinedIcon sx={{ fontSize: 18 }} />
              </button>
            </div>
            <p className={styles.successMeta}>
              Búsqueda{' '}
              {new Date(created.search_at).toLocaleString('es-MX', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <p className={styles.successCosts}>
              {created.payment_method === 'transfer' ? (
                <span>Envío {formatMoney(created.quoted_fee_cents / 100, 'MXN')}</span>
              ) : (
                <>
                  <span>Restaurante {formatMoney(created.collect_cents / 100, 'MXN')}</span>
                  <span aria-hidden>·</span>
                  <span>Envío {formatMoney(created.quoted_fee_cents / 100, 'MXN')}</span>
                </>
              )}
            </p>
            <div className={styles.successActions}>
              <button
                type="button"
                className={styles.successAction}
                onClick={() => void copyCreatedTracking()}
              >
                {copiedTracking ? (
                  <CheckOutlinedIcon fontSize="small" />
                ) : (
                  <ContentCopyOutlinedIcon fontSize="small" />
                )}
                {copiedTracking ? 'Enlace copiado' : 'Copiar rastreo'}
              </button>
              <button
                type="button"
                className={`${styles.successAction} ${styles.successWhatsApp}`}
                onClick={() =>
                  shareTrackingWhatsApp(formatDispatchShortId(created.short_id), trackingUrl)
                }
              >
                <WhatsAppIcon fontSize="small" />
                WhatsApp
              </button>
              <a
                className={styles.successAction}
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
              >
                <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                Abrir rastreo
              </a>
            </div>
          </div>
        </section>
      ) : null}

      <div className={styles.listTabs} role="tablist" aria-label="Solicitudes de delivery">
        <button
          type="button"
          role="tab"
          id="delivery-tab-active"
          aria-selected={listView === 'active'}
          aria-controls="delivery-panel-active"
          className={`${styles.listTab} ${listView === 'active' ? styles.listTabActive : ''}`}
          onClick={() => setListView('active')}
        >
          Activos
          <span className={styles.listTabCount}>{activeRequests.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="delivery-tab-history"
          aria-selected={listView === 'history'}
          aria-controls="delivery-panel-history"
          className={`${styles.listTab} ${listView === 'history' ? styles.listTabActive : ''}`}
          onClick={() => setListView('history')}
        >
          Historial
          <span className={styles.listTabCount}>{historyRequests.length}</span>
        </button>
      </div>

      <div
        id={listView === 'active' ? 'delivery-panel-active' : 'delivery-panel-history'}
        role="tabpanel"
        aria-labelledby={listView === 'active' ? 'delivery-tab-active' : 'delivery-tab-history'}
      >
        <DispatchRecentRequests
          key={listView}
          variant={listView}
          requests={listView === 'active' ? activeRequests : historyRequests}
          subdomain={subdomain}
          busy={confirming}
          onRetry={(request) => void runAction(request, 'retry')}
          onCancel={(request) => setConfirm({ kind: 'cancel', request, step: 1 })}
          onConfirmCash={(request) => setConfirm({ kind: 'cash', request, step: 1 })}
        />
      </div>
      <ConfirmDialog
        open={confirm != null && confirmCopy != null}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.description ?? ''}
        stepHint={confirm ? `Paso ${confirm.step} de 2` : undefined}
        confirmLabel={confirmCopy?.confirmLabel}
        cancelLabel={confirmCopy?.cancelLabel}
        variant={confirmCopy?.variant}
        loading={confirming}
        onCancel={() => {
          if (confirming) return;
          if (confirm?.step === 2) {
            setConfirm({ ...confirm, step: 1 });
            return;
          }
          setConfirm(null);
        }}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.step === 1) {
            setConfirm({ ...confirm, step: 2 });
            return;
          }
          void finishConfirm();
        }}
      />
    </div>
  );
}
