'use client';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RestaurantPlaceAutocomplete } from '@/components/settings/RestaurantPlaceAutocomplete';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  cancelDispatchRequest,
  confirmDispatchCash,
  createDispatchRequest,
  listDispatchLeadTimes,
  listDispatchRequests,
  retryDispatchRequest,
  type DispatchCreateInput,
  type DispatchRequest,
  type DispatchStatus,
} from '@/lib/api/dispatch';
import { ApiError } from '@/lib/api/types';
import { getRestaurant } from '@/lib/api/restaurants';
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

export default function DeliveryPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();
  const [subdomain, setSubdomain] = useState('');
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [leadTimes, setLeadTimes] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DispatchRequest | null>(null);
  const [location, setLocation] = useState<{
    address: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<DispatchCreateInput['payment_method']>('cash');

  const onPlaceSelected = useCallback(
    (place: { address: string; latitude: number; longitude: number }) => {
      setLocation({
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      setDropoffAddress(place.address);
    },
    [],
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
        return;
      }
      const [rows, times] = await Promise.all([
        listDispatchRequests(accessToken, selectedRestaurantId),
        listDispatchLeadTimes(accessToken, selectedRestaurantId),
      ]);
      setSubdomain(restaurant.subdomain);
      setRequests(rows);
      setLeadTimes(times.map((item) => item.prep_minutes));
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
    if (!accessToken || !selectedRestaurantId) {
      return;
    }
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedRestaurantId) return;
    const form = new FormData(event.currentTarget);
    const mapsUrl = String(form.get('dropoff_maps_url') ?? '').trim();
    const address = dropoffAddress.trim();
    if (!location && !mapsUrl) {
      setError('Selecciona una dirección o pega un enlace de Google Maps.');
      return;
    }
    if (!address) {
      setError('Escribe la dirección que verá el repartidor.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const row = await createDispatchRequest(accessToken, selectedRestaurantId, {
        customer_name: String(form.get('customer_name') ?? ''),
        customer_phone: String(form.get('customer_phone') ?? ''),
        dropoff_lat: location?.latitude ?? null,
        dropoff_lng: location?.longitude ?? null,
        dropoff_address: address,
        dropoff_maps_url: mapsUrl || null,
        payment_method: paymentMethod,
        collect_cents: Math.round(Number(form.get('collect_amount') ?? 0) * 100),
        cash_denomination_cents:
          paymentMethod === 'cash'
            ? Math.round(Number(form.get('cash_denomination') ?? 0) * 100)
            : null,
        package_size: String(form.get('package_size')) as 'normal' | 'grande',
        package_count: Number(form.get('package_count')),
        prep_minutes: Number(form.get('prep_minutes')),
        notes: String(form.get('notes') ?? '').trim() || null,
      });
      setCreated(row);
      setRequests((current) => [row, ...current]);
      event.currentTarget.reset();
      setLocation(null);
      setDropoffAddress('');
      setPaymentMethod('cash');
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

      <section className={styles.card} aria-labelledby="new-delivery-title">
        <div className={styles.sectionHeading}>
          <DeliveryDiningOutlinedIcon />
          <div>
            <h2 id="new-delivery-title">Solicitar delivery</h2>
            <p>Completa los datos del cliente, cobro y paquete.</p>
          </div>
        </div>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.grid}>
            <label>
              Nombre del cliente
              <input name="customer_name" required maxLength={200} />
            </label>
            <label>
              Celular
              <input name="customer_phone" type="tel" required maxLength={30} />
            </label>
          </div>

          <RestaurantPlaceAutocomplete onPlaceSelected={onPlaceSelected} />
          {location ? (
            <p className={styles.locationSelected}>
              <RoomOutlinedIcon fontSize="small" />
              {location.address}
            </p>
          ) : null}
          <div className={styles.grid}>
            <label>
              Dirección para el repartidor
              <input
                name="dropoff_address"
                value={dropoffAddress}
                onChange={(event) => setDropoffAddress(event.target.value)}
                placeholder="Calle, número y referencias"
              />
            </label>
            <label>
              Enlace de Google Maps
              <input name="dropoff_maps_url" type="url" placeholder="https://maps.app.goo.gl/…" />
            </label>
          </div>

          <div className={styles.grid}>
            <label>
              Forma de pago
              <select
                name="payment_method"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as DispatchCreateInput['payment_method'])
                }
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card_terminal">Terminal</option>
              </select>
            </label>
            <label>
              {paymentMethod === 'card_terminal' ? 'Cuánto cobrar' : 'Monto a cobrar'}
              <input
                name="collect_amount"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue="0"
              />
            </label>
            {paymentMethod === 'cash' ? (
              <label>
                ¿Con cuánto paga?
                <input
                  name="cash_denomination"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
            ) : null}
          </div>

          <div className={styles.grid}>
            <label>
              Tamaño del paquete mayor
              <select name="package_size" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="grande">Grande</option>
              </select>
            </label>
            <label>
              Número de paquetes
              <input name="package_count" type="number" min="1" required defaultValue="1" />
            </label>
            <label>
              Listo en
              <select name="prep_minutes" required defaultValue={leadTimes[0]}>
                {leadTimes.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutos
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.weightNotice}>Máximo 20 kg en la suma de todos los paquetes.</p>
          <label>
            Notas para el repartidor
            <textarea name="notes" maxLength={500} rows={3} />
          </label>
          <button className={styles.primaryButton} type="submit" disabled={submitting || !leadTimes.length}>
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
        <div className={styles.list}>
          {requests.length ? (
            requests.map((request) => (
              <article className={styles.request} key={request.id}>
                <div className={styles.requestMain}>
                  <span className={styles.statusIcon}>{statusIcon(request.status)}</span>
                  <div>
                    <h3>{request.customer_name}</h3>
                    <p>{request.dropoff_address}</p>
                    <span>{STATUS_LABELS[request.status]} · {money(request.quoted_fee_cents)}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  {request.status === 'unassigned' ? (
                    <button type="button" onClick={() => void runAction(request, 'retry')}>Reintentar</button>
                  ) : null}
                  {!['delivered', 'cancelled'].includes(request.status) ? (
                    <button type="button" onClick={() => void runAction(request, 'cancel')}>Cancelar</button>
                  ) : null}
                  {request.payment_method === 'cash' && CASH_CONFIRMABLE.has(request.status) ? (
                    <button type="button" onClick={() => void runAction(request, 'cash')}>Rider ya me pagó</button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className={styles.empty}>Todavía no hay solicitudes de delivery.</p>
          )}
        </div>
      </section>
    </div>
  );
}
