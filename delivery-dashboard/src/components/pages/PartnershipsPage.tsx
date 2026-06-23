'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActivePartnershipCard } from '@/components/partnerships/ActivePartnershipCard';
import { PartnershipRequestCard } from '@/components/partnerships/PartnershipRequestCard';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useAuth } from '@/hooks/useAuth';
import {
  acceptPartnershipRequest,
  listActivePartnerships,
  listPartnershipRequests,
  rejectPartnershipRequest,
} from '@/lib/api/partnerships';
import type { DeliveryPartnershipRequest } from '@/lib/api/types';
import styles from './PartnershipsPage.module.css';

type Tab = 'pending' | 'active';

export default function PartnershipsPage() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<DeliveryPartnershipRequest[]>([]);
  const [activePartnerships, setActivePartnerships] = useState<DeliveryPartnershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [pendingRows, activeRows] = await Promise.all([
        listPartnershipRequests(accessToken),
        listActivePartnerships(accessToken),
      ]);
      setRequests(pendingRows);
      setActivePartnerships(activeRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los restaurantes');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleAccept(linkId: string) {
    if (!accessToken) return;
    setBusyId(linkId);
    setError(null);
    try {
      const accepted = await acceptPartnershipRequest(accessToken, linkId);
      setRequests((prev) => prev.filter((row) => row.id !== linkId));
      setActivePartnerships((prev) => [accepted, ...prev.filter((row) => row.id !== accepted.id)]);
      setTab('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar la solicitud');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(linkId: string) {
    if (!accessToken) return;
    setBusyId(linkId);
    setError(null);
    try {
      await rejectPartnershipRequest(accessToken, linkId);
      setRequests((prev) => prev.filter((row) => row.id !== linkId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar la solicitud');
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = requests.length;
  const activeCount = activePartnerships.length;

  return (
    <PanelPageShell
      title="Restaurantes"
      subtitle="Gestiona solicitudes de reparto y consulta los restaurantes con los que ya tienes acceso activo."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.empty,
        emptyTitle: styles.emptyTitle,
        emptySubtitle: styles.emptySubtitle,
      }}
      action={
        pendingCount > 0 ? (
          <span className={styles.badge} aria-label={`${pendingCount} solicitudes pendientes`}>
            {pendingCount}
          </span>
        ) : undefined
      }
    >
      <div className={styles.tabs} role="tablist" aria-label="Secciones de restaurantes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={`${styles.tab} ${tab === 'pending' ? styles.tabActive : ''}`}
          onClick={() => setTab('pending')}
        >
          Pendientes
          {pendingCount > 0 ? <span className={styles.tabCount}>{pendingCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={`${styles.tab} ${tab === 'active' ? styles.tabActive : ''}`}
          onClick={() => setTab('active')}
        >
          Activos
          {activeCount > 0 ? <span className={styles.tabCount}>{activeCount}</span> : null}
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Cargando restaurantes…</div>
      ) : error ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Error al cargar</p>
          <p className={styles.emptySubtitle}>{error}</p>
        </div>
      ) : tab === 'pending' ? (
        requests.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Sin solicitudes pendientes</p>
            <p className={styles.emptySubtitle}>
              Cuando un restaurante active reparto con Mexy, aparecerá aquí para que lo revises.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {requests.map((request) => (
              <PartnershipRequestCard
                key={request.id}
                request={request}
                busy={busyId === request.id}
                onAccept={() => void handleAccept(request.id)}
                onReject={() => void handleReject(request.id)}
              />
            ))}
          </div>
        )
      ) : activePartnerships.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Sin restaurantes activos</p>
          <p className={styles.emptySubtitle}>
            Los restaurantes que aceptes para reparto aparecerán aquí con su ubicación y contacto.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {activePartnerships.map((partnership) => (
            <ActivePartnershipCard key={partnership.id} partnership={partnership} />
          ))}
        </div>
      )}
    </PanelPageShell>
  );
}
