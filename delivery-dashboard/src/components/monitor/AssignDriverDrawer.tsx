'use client';

import { useMemo, useState } from 'react';
import { DriverAvatar } from '@/components/drivers/DriverAvatar';
import { DriverMetaTags } from '@/components/drivers/DriverMetaTags';
import { RightDrawer } from '@/components/ui/RightDrawer';
import type { DispatchMonitorDriver, DispatchMonitorRequest } from '@/lib/api/types';
import { formatShortId, requestMoneyLine, requestPackageLine } from '@/lib/dispatch/monitorCopy';
import styles from './AssignDriverDrawer.module.css';

type AssignDriverDrawerProps = {
  open: boolean;
  request: DispatchMonitorRequest | null;
  drivers: DispatchMonitorDriver[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onAssign: (driverId: string) => void;
};

function requestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: 'Programado',
    searching: 'Buscando',
    offered: 'Ofertado',
    unassigned: 'Sin asignar',
    assigned: 'Asignado',
    picked_up: 'Recogido',
    in_transit: 'En camino',
  };
  return labels[status] ?? status;
}

export function AssignDriverDrawer({
  open,
  request,
  drivers,
  submitting,
  error,
  onClose,
  onAssign,
}: AssignDriverDrawerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!request) return [];
    return [...drivers]
      .filter((driver) => driver.status !== 'blocked')
      .sort((a, b) => Number(b.is_online) - Number(a.is_online))
      .map((driver) => {
        const isCurrent = driver.id === request.assigned_driver_id;
        const hasOpenOffer = Boolean(driver.open_offer_id);
        const smallBox =
          request.package_size === 'grande' && driver.compartment_size !== 'grande';
        const noCredit =
          request.payment_method === 'cash' &&
          (driver.credit_blocked || driver.credit_available_cents < request.collect_cents);
        const warnings: string[] = [];
        if (!driver.is_online) warnings.push('Offline');
        if (driver.location_stale) warnings.push('GPS');
        if (noCredit) warnings.push('Sin crédito');
        if (smallBox) warnings.push('Compartimento chico');
        if (driver.active_request_id) {
          warnings.push(driver.is_pre_free ? 'Pre-libre' : 'En ruta');
        }
        if (hasOpenOffer) warnings.push('Oferta abierta');
        const disabled = isCurrent || hasOpenOffer || submitting;
        return { driver, isCurrent, warnings, disabled };
      });
  }, [drivers, request, submitting]);

  const selected = rows.find((row) => row.driver.id === selectedId);

  return (
    <RightDrawer
      open={open}
      title={request ? `Asignar · ${formatShortId(request.short_id)}` : 'Asignar repartidor'}
      onClose={() => {
        setSelectedId(null);
        onClose();
      }}
    >
      {request ? (
        <>
          <p className={styles.hint}>
            Se envía una oferta al repartidor. El pedido no cambia de rider hasta que acepte. El
            link de rastreo del negocio no cambia.
          </p>
          <div className={styles.summary}>
            <span>{formatShortId(request.short_id)} · {request.customer_name}</span>
            <span>{request.restaurant_name}</span>
            <span>{requestStatusLabel(request.status)}</span>
            {request.assigned_driver_name ? (
              <span>Actual: {request.assigned_driver_name}</span>
            ) : null}
            <span>{requestMoneyLine(request)}</span>
            <span>{requestPackageLine(request)}</span>
            {request.zone_name ? <span>{request.zone_name}</span> : null}
            {request.dropoff_address ? <span>{request.dropoff_address}</span> : null}
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <ul className={styles.list}>
            {rows.map(({ driver, isCurrent, warnings, disabled }) => {
              const active = selectedId === driver.id;
              return (
                <li key={driver.id}>
                  <button
                    type="button"
                    className={`${styles.row}${active ? ` ${styles.rowActive}` : ''}`}
                    onClick={() => setSelectedId(driver.id)}
                    disabled={disabled}
                  >
                    <DriverAvatar
                      firstName={driver.first_name}
                      lastName={driver.last_name}
                      profilePhotoPath={driver.profile_photo_path}
                      size="sm"
                    />
                    <div className={styles.rowMain}>
                      <span className={styles.name}>
                        {driver.first_name} {driver.last_name}
                        {isCurrent ? ' · actual' : ''}
                      </span>
                      <DriverMetaTags
                        plate={driver.plate}
                        motorcycleColor={driver.motorcycle_color}
                        compartmentSize={driver.compartment_size}
                        creditAvailableCents={driver.credit_available_cents}
                      />
                      {warnings.length > 0 ? (
                        <span className={styles.warnings}>{warnings.join(' · ')}</span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className={styles.confirm}
            disabled={!selected || selected.disabled || submitting}
            onClick={() => {
              if (!selected) return;
              onAssign(selected.driver.id);
            }}
          >
            {submitting
              ? 'Enviando oferta…'
              : selected
                ? `Enviar oferta a ${selected.driver.first_name}`
                : 'Elige un repartidor'}
          </button>
        </>
      ) : null}
    </RightDrawer>
  );
}
