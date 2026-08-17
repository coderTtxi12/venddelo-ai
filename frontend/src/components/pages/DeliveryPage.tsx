'use client';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeliveryLocationValue } from '@/components/digital-menu/CheckoutDeliveryAddressPicker';
import { DispatchDeliveryAddressPicker } from '@/components/dispatch/DispatchDeliveryAddressPicker';
import { FormSelect } from '@/components/ui/FormSelect';
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
  type DispatchStatus,
} from '@/lib/api/dispatch';
import { getPublicCheckoutConfig, type PublicDeliveryService } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import { getRestaurant } from '@/lib/api/restaurants';
import { formatMoney } from '@/lib/currency';
import { getDeliveryWeatherNotice } from '@/lib/digital-menu/checkout/deliveryWeatherNotice';
import { usePublicDeliveryQuote } from '@/lib/digital-menu/checkout/usePublicDeliveryQuote';
import { isActiveDeliveryPartnership } from '@/lib/fetchActiveDeliveryProviderConfig';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import styles from './DeliveryPage.module.css';

const STATUS_LABELS: Record<DispatchStatus, string> = {
  scheduled: 'Programado',
  searching: 'Buscando repartidor',
  offered: 'Oferta enviada',
  assigned: 'Repartidor asignado',
  picked_up: 'Pedido recogido',
  in_transit: 'En camino',
  delivered: 'Entregado',
  unassigned: 'Sin repartidor',
  cancelled: 'Cancelado',
};

const CASH_CONFIRMABLE = new Set<DispatchStatus>([
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
]);

const PREP_CUSTOM_VALUE = 'custom';

const EMPTY_LOCATION: DeliveryLocationValue = {
  address: '',
  latitude: null,
  longitude: null,
  placeId: null,
};

function statusIcon(status: DispatchStatus) {
  if (status === 'delivered') return <DoneAllOutlinedIcon fontSize="small" />;
  if (status === 'unassigned' || status === 'cancelled') {
    return <ErrorOutlineOutlinedIcon fontSize="small" />;
  }
  if (status === 'scheduled') return <ScheduleOutlinedIcon fontSize="small" />;
  if (status === 'searching' || status === 'offered') {
    return <DeliveryDiningOutlinedIcon fontSize="small" />;
  }
  return <LocalShippingOutlinedIcon fontSize="small" />;
}

function money(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(cents / 100);
}

function parsePesosToCents(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return Math.round(Number(trimmed) * 100);
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
    subdomain &&
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
    const customerName = String(form.get('customer_name') ?? '').trim();
    const customerPhone = String(form.get('customer_phone') ?? '').trim();
    if (!customerName || !customerPhone) {
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
        customer_name: customerName,
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
    action: 'cancel' | 'retry' | 'cash',
  ) {
    if (!accessToken || !selectedRestaurantId) return;
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
    } catch (actionError) {
      setError(
        actionError instanceof ApiError ? actionError.message : 'No se pudo actualizar la solicitud.',
      );
    }
  }

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
      </header>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {!courierAvailable ? (
        <div className={styles.serviceAlert} role="alert">
          {courierReason ?? 'El servicio de reparto de Mexy no está disponible en este momento.'}
        </div>
      ) : null}

      <section className={styles.card} aria-labelledby="new-delivery-title">
        <div className={styles.sectionHeading}>
          <DeliveryDiningOutlinedIcon />
          <div>
            <h2 id="new-delivery-title">Solicitar delivery</h2>
            <p>Completa los datos del cliente, cobro y paquete.</p>
          </div>
        </div>

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
                disabled={!courierAvailable}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="customer-phone">
                Celular
              </label>
              <input
                id="customer-phone"
                name="customer_phone"
                type="tel"
                className={styles.input}
                required
                maxLength={30}
                disabled={!courierAvailable}
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

          {deliveryQuote?.available && location.latitude != null ? (
            <div className={styles.feeCard} role="status">
              <span className={styles.feeLabel}>Costo de envío</span>
              <span className={styles.feeValue}>
                {formatMoney(deliveryQuote.delivery_fee_cents / 100, 'MXN')}
              </span>
              <span className={styles.feeHint}>
                {deliveryQuote.inside_polygon
                  ? 'Dentro de la zona de cobertura.'
                  : deliveryQuote.distance_km != null
                    ? `${deliveryQuote.distance_km.toFixed(1)} km de ruta · solo horario diurno`
                    : 'Fuera del polígono de cobertura · solo horario diurno'}
              </span>
              {deliveryWeatherFeeNotice ? (
                <p className={styles.weatherNotice}>
                  <WaterDropOutlinedIcon className={styles.weatherIcon} aria-hidden />
                  <span>{deliveryWeatherFeeNotice}</span>
                </p>
              ) : null}
            </div>
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
                  {paymentMethod === 'card_terminal' ? 'Cuánto cobrar' : 'Monto a cobrar'}
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
      </section>

      {created && trackingUrl ? (
        <section className={styles.success} aria-live="polite">
          <DoneAllOutlinedIcon />
          <div>
            <h2>Solicitud creada</h2>
            <p>
              La búsqueda inicia el{' '}
              {new Date(created.search_at).toLocaleString('es-MX', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              .
            </p>
            <div className={styles.trackingLink}>
              <a href={trackingUrl} target="_blank" rel="noreferrer">{trackingUrl}</a>
              <button
                type="button"
                aria-label="Copiar enlace de rastreo"
                onClick={() => navigator.clipboard.writeText(trackingUrl)}
              >
                <ContentCopyOutlinedIcon fontSize="small" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="dispatch-list-title">
        <div className={styles.sectionHeading}>
          <LocalShippingOutlinedIcon />
          <div>
            <h2 id="dispatch-list-title">Solicitudes recientes</h2>
            <p>Consulta el estado y administra tus entregas.</p>
          </div>
        </div>
        <ul className={styles.list}>
          {requests.length ? (
            requests.map((request) => (
              <li key={request.id}>
                <article className={styles.request}>
                  <div className={styles.requestMain}>
                    <span className={styles.statusIcon}>{statusIcon(request.status)}</span>
                    <div className={styles.requestBody}>
                      <h3>{request.customer_name}</h3>
                      <p>{request.dropoff_address}</p>
                      <div className={styles.requestMeta}>
                        <span className={styles.statusChip}>
                          {STATUS_LABELS[request.status]}
                        </span>
                        <span>{money(request.quoted_fee_cents)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    {request.status === 'unassigned' ? (
                      <button type="button" onClick={() => void runAction(request, 'retry')}>
                        Reintentar
                      </button>
                    ) : null}
                    {!['delivered', 'cancelled'].includes(request.status) ? (
                      <button type="button" onClick={() => void runAction(request, 'cancel')}>
                        Cancelar
                      </button>
                    ) : null}
                    {request.payment_method === 'cash' && CASH_CONFIRMABLE.has(request.status) ? (
                      <button type="button" onClick={() => void runAction(request, 'cash')}>
                        Rider ya me pagó
                      </button>
                    ) : null}
                  </div>
                </article>
              </li>
            ))
          ) : (
            <li className={styles.empty}>Todavía no hay solicitudes de delivery.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
