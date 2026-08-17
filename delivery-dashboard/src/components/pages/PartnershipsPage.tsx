'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivePartnershipCard } from '@/components/partnerships/ActivePartnershipCard';
import { PartnershipRequestCard } from '@/components/partnerships/PartnershipRequestCard';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import {
  acceptPartnershipRequest,
  listActivePartnerships,
  listPartnershipRequests,
  reassignPartnershipZone,
  rejectPartnershipRequest,
} from '@/lib/api/partnerships';
import type { DeliveryPartnershipRequest, DeliveryProviderZone } from '@/lib/api/types';
import styles from './PartnershipsPage.module.css';

type Tab = 'pending' | 'active';

type ZoneGroup = {
  zone: { id: string; name: string };
  items: DeliveryPartnershipRequest[];
};

function groupItemsByZone(
  items: DeliveryPartnershipRequest[],
  zones: DeliveryProviderZone[],
): ZoneGroup[] {
  const byZone = new Map<string, DeliveryPartnershipRequest[]>();
  for (const item of items) {
    const rows = byZone.get(item.zone.id) ?? [];
    rows.push(item);
    byZone.set(item.zone.id, rows);
  }

  const groups: ZoneGroup[] = [];
  for (const zone of zones) {
    const zoneItems = byZone.get(zone.id);
    if (zoneItems?.length) {
      groups.push({ zone: { id: zone.id, name: zone.name }, items: zoneItems });
      byZone.delete(zone.id);
    }
  }

  for (const zoneItems of byZone.values()) {
    if (zoneItems.length > 0) {
      groups.push({ zone: zoneItems[0].zone, items: zoneItems });
    }
  }

  return groups;
}

export default function PartnershipsPage() {
  const { accessToken } = useAuth();
  const { zones } = useDeliveryZone();
  const { canManagePartnerships } = useDeliveryProviderAccess();
  const [tab, setTab] = useState<Tab>('pending');
  const [filterZoneId, setFilterZoneId] = useState<string | null>(null);
  const [requests, setRequests] = useState<DeliveryPartnershipRequest[]>([]);
  const [activePartnerships, setActivePartnerships] = useState<DeliveryPartnershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
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

  async function handleReassign(linkId: string, zoneId: string, source: Tab) {
    if (!accessToken) return;
    setReassigningId(linkId);
    setError(null);
    try {
      const updated = await reassignPartnershipZone(accessToken, linkId, zoneId);
      const updater = (prev: DeliveryPartnershipRequest[]) =>
        prev.map((row) => (row.id === linkId ? updated : row));
      if (source === 'pending') {
        setRequests(updater);
      } else {
        setActivePartnerships(updater);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reasignar la zona');
    } finally {
      setReassigningId(null);
    }
  }

  const pendingInView = useMemo(
    () => (filterZoneId ? requests.filter((item) => item.zone.id === filterZoneId) : requests),
    [filterZoneId, requests],
  );
  const activeInView = useMemo(
    () =>
      filterZoneId
        ? activePartnerships.filter((item) => item.zone.id === filterZoneId)
        : activePartnerships,
    [activePartnerships, filterZoneId],
  );
  const pendingCount = pendingInView.length;
  const activeCount = activeInView.length;

  const tabItems = tab === 'pending' ? pendingInView : activeInView;

  const groupedItems = useMemo(
    () => (filterZoneId ? null : groupItemsByZone(tabItems, zones)),
    [filterZoneId, tabItems, zones],
  );

  const zoneFilterEmpty =
    filterZoneId !== null &&
    (tab === 'pending' ? requests : activePartnerships).length > 0 &&
    tabItems.length === 0;

  const cardProps = {
    zones,
    canReassign: canManagePartnerships,
  };

  function renderPendingCard(request: DeliveryPartnershipRequest) {
    return (
      <PartnershipRequestCard
        key={request.id}
        request={request}
        busy={busyId === request.id}
        reassigning={reassigningId === request.id}
        onAccept={() => void handleAccept(request.id)}
        onReject={() => void handleReject(request.id)}
        onZoneChange={(zoneId) => void handleReassign(request.id, zoneId, 'pending')}
        {...cardProps}
      />
    );
  }

  function renderActiveCard(partnership: DeliveryPartnershipRequest) {
    return (
      <ActivePartnershipCard
        key={partnership.id}
        partnership={partnership}
        reassigning={reassigningId === partnership.id}
        onZoneChange={(zoneId) => void handleReassign(partnership.id, zoneId, 'active')}
        {...cardProps}
      />
    );
  }

  function renderList() {
    if (zoneFilterEmpty) {
      return (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nadie en esta zona todavía</p>
          <p className={styles.emptySubtitle}>
            Las solicitudes de esta zona aparecerán aquí.
          </p>
        </div>
      );
    }

    if (filterZoneId) {
      return (
        <div className={styles.list}>
          {tabItems.map((item) =>
            tab === 'pending' ? renderPendingCard(item) : renderActiveCard(item),
          )}
        </div>
      );
    }

    return (
      <div className={styles.list}>
        {groupedItems?.map((group) => (
          <section key={group.zone.id} className={styles.zoneGroup}>
            <h3 className={styles.zoneHeading}>{group.zone.name}</h3>
            {group.items.map((item) =>
              tab === 'pending' ? renderPendingCard(item) : renderActiveCard(item),
            )}
          </section>
        ))}
      </div>
    );
  }

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
      {zones.length > 0 ? (
        <div className={styles.zoneFilters} role="group" aria-label="Filtrar por zona">
          <button
            type="button"
            className={`${styles.zoneFilterChip} ${filterZoneId === null ? styles.zoneFilterChipActive : ''}`}
            onClick={() => setFilterZoneId(null)}
          >
            Todas
          </button>
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={`${styles.zoneFilterChip} ${filterZoneId === zone.id ? styles.zoneFilterChipActive : ''}`}
              onClick={() => setFilterZoneId(zone.id)}
            >
              {zone.name}
            </button>
          ))}
        </div>
      ) : null}

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
          renderList()
        )
      ) : activePartnerships.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Sin restaurantes activos</p>
          <p className={styles.emptySubtitle}>
            Los restaurantes que aceptes para reparto aparecerán aquí con su ubicación y contacto.
          </p>
        </div>
      ) : (
        renderList()
      )}
    </PanelPageShell>
  );
}
