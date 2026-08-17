'use client';

import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { useEffect, useState } from 'react';
import {
  getPublicDispatchTracking,
  type DispatchStatus,
  type PublicDispatchTracking,
} from '@/lib/api/dispatch';
import { ApiError } from '@/lib/api/types';
import styles from './PublicTracking.module.css';

const STATUS_COPY: Record<DispatchStatus, { title: string; detail: string }> = {
  scheduled: {
    title: 'Tu entrega está programada',
    detail: 'La búsqueda de repartidor comenzará a la hora indicada por el restaurante.',
  },
  searching: {
    title: 'Buscando repartidor',
    detail: 'Estamos buscando al mejor repartidor disponible para tu entrega.',
  },
  offered: {
    title: 'Contactando a un repartidor',
    detail: 'Un repartidor está revisando la solicitud.',
  },
  assigned: {
    title: 'Repartidor asignado',
    detail: 'El repartidor se dirige al restaurante.',
  },
  picked_up: {
    title: 'Pedido recogido',
    detail: 'El repartidor ya tiene tu pedido.',
  },
  in_transit: {
    title: 'Tu entrega va en camino',
    detail: 'El repartidor se dirige a la ubicación de entrega.',
  },
  delivered: {
    title: 'Entrega completada',
    detail: 'Tu pedido fue entregado.',
  },
  unassigned: {
    title: 'Aún no encontramos repartidor',
    detail: 'El restaurante puede volver a intentar la búsqueda.',
  },
  cancelled: {
    title: 'Entrega cancelada',
    detail: 'Esta solicitud fue cancelada.',
  },
};

function icon(status: DispatchStatus) {
  if (status === 'delivered') return <DoneAllOutlinedIcon />;
  if (status === 'scheduled') return <ScheduleOutlinedIcon />;
  if (status === 'searching' || status === 'offered') {
    return <DeliveryDiningOutlinedIcon />;
  }
  if (status === 'cancelled' || status === 'unassigned') {
    return <ErrorOutlineOutlinedIcon />;
  }
  return <LocalShippingOutlinedIcon />;
}

export function PublicTracking({ token }: { token: string }) {
  const [tracking, setTracking] = useState<PublicDispatchTracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await getPublicDispatchTracking(token);
        if (!cancelled) {
          setTracking(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof ApiError && loadError.httpStatus === 404
              ? 'No encontramos este enlace de rastreo.'
              : 'No se pudo actualizar el estado de la entrega.',
          );
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  if (error) {
    return (
      <main className={styles.shell}>
        <section className={styles.error} role="alert">
          <ErrorOutlineOutlinedIcon />
          <h1>Rastreo no disponible</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!tracking) {
    return <main className={styles.shell}><p className={styles.loading}>Cargando rastreo…</p></main>;
  }

  const copy = STATUS_COPY[tracking.status];
  const mapUrl = `https://www.google.com/maps?q=${tracking.dropoff.latitude},${tracking.dropoff.longitude}&z=15&output=embed`;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.brand}>Mexy Delivery</div>
        <div className={styles.status}>
          <span className={styles.icon}>{icon(tracking.status)}</span>
          <div>
            <p className={styles.eyebrow}>Estado de tu entrega</p>
            <h1>{copy.title}</h1>
            <p>{copy.detail}</p>
          </div>
        </div>

        {tracking.rider ? (
          <div className={styles.rider}>
            <LocalShippingOutlinedIcon fontSize="small" />
            Tu repartidor es <strong>{tracking.rider.first_name}</strong>
            {tracking.eta_seconds != null
              ? ` · aproximadamente ${Math.max(1, Math.ceil(tracking.eta_seconds / 60))} min`
              : ''}
          </div>
        ) : null}

        <div className={styles.mapWrap}>
          <iframe
            src={mapUrl}
            title="Ubicación de entrega"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className={styles.address}>
          <strong>Destino</strong>
          <span>{tracking.dropoff.address}</span>
        </div>
      </section>
    </main>
  );
}
