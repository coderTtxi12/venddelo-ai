'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';
import { ActivePartnershipCard } from '@/components/partnerships/ActivePartnershipCard';
import { PartnershipRequestCard } from '@/components/partnerships/PartnershipRequestCard';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSelect } from '@/components/ui/FormSelect';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import {
  acceptPartnershipRequest,
  listActivePartnerships,
  listPartnershipRequests,
  rejectPartnershipRequest,
  updatePartnership,
} from '@/lib/api/partnerships';
import {
  PARTNERSHIP_PAGE_SIZE,
  defaultPartnershipSort,
  type PartnershipSort,
} from '@/lib/api/partnershipQuery';
import type { DeliveryPartnershipRequest } from '@/lib/api/types';
import styles from './PartnershipsPage.module.css';

type Tab = 'pending' | 'active';

const SORT_OPTIONS: Array<{ value: PartnershipSort; label: string }> = [
  { value: '-created_at', label: 'Más recientes' },
  { value: 'name', label: 'Nombre A-Z' },
  { value: '-name', label: 'Nombre Z-A' },
  { value: 'email', label: 'Correo A-Z' },
  { value: '-email', label: 'Correo Z-A' },
  { value: '-has_web_app', label: 'Web app primero' },
];

export default function PartnershipsPage() {
  const { accessToken } = useAuth();
  const { zones } = useDeliveryZone();
  const { canManagePartnerships } = useDeliveryProviderAccess();
  const [tab, setTab] = useState<Tab>('pending');
  const [filterZoneId, setFilterZoneId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [hasWebApp, setHasWebApp] = useState<boolean | null>(null);
  const [onHold, setOnHold] = useState<boolean | null>(null);
  const [sort, setSort] = useState<PartnershipSort>(defaultPartnershipSort('pending'));
  const [offset, setOffset] = useState(0);
  const [requests, setRequests] = useState<DeliveryPartnershipRequest[]>([]);
  const [activePartnerships, setActivePartnerships] = useState<DeliveryPartnershipRequest[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [holdConfirmId, setHoldConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = searchInput.trim();
    const timer = window.setTimeout(() => {
      setQ((current) => {
        if (current === next) return current;
        setOffset(0);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({
      zoneId: filterZoneId,
      q,
      hasWebApp,
      sort: tab === 'active' && sort === '-created_at' ? '-activated_at' : sort,
      limit: PARTNERSHIP_PAGE_SIZE,
      offset,
    }),
    [filterZoneId, hasWebApp, offset, q, sort, tab],
  );

  const loadAll = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const pendingQuery = tab === 'pending' ? listQuery : { ...listQuery, offset: 0, limit: 1 };
      const activeQuery = {
        ...(tab === 'active' ? listQuery : { ...listQuery, offset: 0, limit: 1 }),
        onHold: tab === 'active' ? onHold : null,
      };
      const [pendingPage, activePage] = await Promise.all([
        listPartnershipRequests(accessToken, pendingQuery),
        listActivePartnerships(accessToken, activeQuery),
      ]);
      if (tab === 'pending') setRequests(pendingPage.items);
      else setActivePartnerships(activePage.items);
      setPendingTotal(pendingPage.total);
      setActiveTotal(activePage.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los restaurantes');
    } finally {
      setLoading(false);
    }
  }, [accessToken, listQuery, onHold, tab]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function replaceRow(row: DeliveryPartnershipRequest, source: Tab) {
    const updater = (prev: DeliveryPartnershipRequest[]) =>
      prev.map((item) => (item.id === row.id ? row : item));
    if (source === 'pending') setRequests(updater);
    else setActivePartnerships(updater);
  }

  async function handleAccept(linkId: string) {
    if (!accessToken) return;
    setBusyId(linkId);
    setError(null);
    try {
      const accepted = await acceptPartnershipRequest(accessToken, linkId);
      setRequests((prev) => prev.filter((row) => row.id !== linkId));
      setPendingTotal((count) => Math.max(0, count - 1));
      setActivePartnerships((prev) => [accepted, ...prev.filter((row) => row.id !== accepted.id)]);
      setActiveTotal((count) => count + 1);
      setTab('active');
      setOffset(0);
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
      setPendingTotal((count) => Math.max(0, count - 1));
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
      replaceRow(await updatePartnership(accessToken, linkId, { zone_id: zoneId }), source);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reasignar la zona');
    } finally {
      setReassigningId(null);
    }
  }

  async function handleWebAppChange(linkId: string, next: boolean, source: Tab) {
    if (!accessToken) return;
    setReassigningId(linkId);
    setError(null);
    try {
      replaceRow(await updatePartnership(accessToken, linkId, { has_web_app: next }), source);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el indicador de web app');
    } finally {
      setReassigningId(null);
    }
  }

  async function handleHoldChange(linkId: string, next: boolean) {
    if (!accessToken) return;
    setReassigningId(linkId);
    setError(null);
    try {
      const updated = await updatePartnership(accessToken, linkId, { on_hold: next });
      if (onHold !== null && updated.on_hold !== onHold) {
        setActivePartnerships((prev) => prev.filter((row) => row.id !== linkId));
        setActiveTotal((count) => Math.max(0, count - 1));
      } else {
        replaceRow(updated, 'active');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el hold');
    } finally {
      setReassigningId(null);
      setHoldConfirmId(null);
    }
  }

  const tabItems = tab === 'pending' ? requests : activePartnerships;
  const tabTotal = tab === 'pending' ? pendingTotal : activeTotal;
  const pageStart = tabTotal === 0 ? 0 : offset + 1;
  const pageEnd = offset + tabItems.length;
  const canPrev = offset > 0;
  const canNext = offset + PARTNERSHIP_PAGE_SIZE < tabTotal;

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
        onWebAppChange={(next) => void handleWebAppChange(request.id, next, 'pending')}
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
        onWebAppChange={(next) => void handleWebAppChange(partnership.id, next, 'active')}
        onHoldChange={(next) => {
          if (next) setHoldConfirmId(partnership.id);
          else void handleHoldChange(partnership.id, false);
        }}
        {...cardProps}
      />
    );
  }

  function resetPage() {
    setOffset(0);
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
        pendingTotal > 0 ? (
          <span className={styles.badge} aria-label={`${pendingTotal} solicitudes pendientes`}>
            {pendingTotal}
          </span>
        ) : undefined
      }
    >
      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor="partnerships-search">Buscar</label>
          <div className={styles.searchWrap}>
            <span className={styles.controlIcon} aria-hidden>
              <SearchOutlinedIcon fontSize="small" />
            </span>
            <input
              id="partnerships-search"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={styles.search}
              placeholder="Nombre, correo o subdominio"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput ? (
              <button
                type="button"
                className={styles.clearSearch}
                aria-label="Borrar búsqueda"
                onClick={() => setSearchInput('')}
              >
                <CloseOutlinedIcon fontSize="small" />
              </button>
            ) : null}
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="partnerships-sort">Ordenar</label>
          <div className={styles.sortWrap}>
            <span className={styles.controlIcon} aria-hidden>
              <SwapVertOutlinedIcon fontSize="small" />
            </span>
            <FormSelect
              id="partnerships-sort"
              value={sort}
              options={SORT_OPTIONS}
              onChange={(value) => {
                setSort(value as PartnershipSort);
                resetPage();
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.zoneFilters} role="group" aria-label="Filtrar por web app">
        <button
          type="button"
          className={`${styles.zoneFilterChip} ${hasWebApp === null ? styles.zoneFilterChipActive : ''}`}
          onClick={() => {
            setHasWebApp(null);
            resetPage();
          }}
        >
          Todas
        </button>
        <button
          type="button"
          className={`${styles.zoneFilterChip} ${hasWebApp === true ? styles.zoneFilterChipActive : ''}`}
          onClick={() => {
            setHasWebApp(true);
            resetPage();
          }}
        >
          Con web app
        </button>
        <button
          type="button"
          className={`${styles.zoneFilterChip} ${hasWebApp === false ? styles.zoneFilterChipActive : ''}`}
          onClick={() => {
            setHasWebApp(false);
            resetPage();
          }}
        >
          Sin web app
        </button>
      </div>

      {tab === 'active' ? (
        <div className={styles.zoneFilters} role="group" aria-label="Filtrar por hold">
          <button
            type="button"
            className={`${styles.zoneFilterChip} ${onHold === null ? styles.zoneFilterChipActive : ''}`}
            onClick={() => {
              setOnHold(null);
              resetPage();
            }}
          >
            Todas
          </button>
          <button
            type="button"
            className={`${styles.zoneFilterChip} ${onHold === true ? styles.zoneFilterChipActive : ''}`}
            onClick={() => {
              setOnHold(true);
              resetPage();
            }}
          >
            En hold
          </button>
          <button
            type="button"
            className={`${styles.zoneFilterChip} ${onHold === false ? styles.zoneFilterChipActive : ''}`}
            onClick={() => {
              setOnHold(false);
              resetPage();
            }}
          >
            Sin hold
          </button>
        </div>
      ) : null}

      {zones.length > 0 ? (
        <div className={styles.zoneFilters} role="group" aria-label="Filtrar por zona">
          <button
            type="button"
            className={`${styles.zoneFilterChip} ${filterZoneId === null ? styles.zoneFilterChipActive : ''}`}
            onClick={() => {
              setFilterZoneId(null);
              resetPage();
            }}
          >
            Todas las zonas
          </button>
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={`${styles.zoneFilterChip} ${filterZoneId === zone.id ? styles.zoneFilterChipActive : ''}`}
              onClick={() => {
                setFilterZoneId(zone.id);
                resetPage();
              }}
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
          onClick={() => {
            setTab('pending');
            resetPage();
          }}
        >
          Pendientes
          {pendingTotal > 0 ? <span className={styles.tabCount}>{pendingTotal}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={`${styles.tab} ${tab === 'active' ? styles.tabActive : ''}`}
          onClick={() => {
            setTab('active');
            resetPage();
          }}
        >
          Activos
          {activeTotal > 0 ? <span className={styles.tabCount}>{activeTotal}</span> : null}
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Cargando restaurantes…</div>
      ) : error ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Error al cargar</p>
          <p className={styles.emptySubtitle}>{error}</p>
        </div>
      ) : tabTotal === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {tab === 'pending' ? 'Sin solicitudes pendientes' : 'Sin restaurantes activos'}
          </p>
          <p className={styles.emptySubtitle}>
            {q || hasWebApp !== null || onHold !== null || filterZoneId
              ? 'Prueba con otro filtro o búsqueda.'
              : tab === 'pending'
                ? 'Cuando un restaurante active reparto con Mexy, aparecerá aquí para que lo revises.'
                : 'Los restaurantes que aceptes para reparto aparecerán aquí con su ubicación y contacto.'}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {tabItems.map((item) =>
              tab === 'pending' ? renderPendingCard(item) : renderActiveCard(item),
            )}
          </div>
          <div className={styles.pagination}>
            <p className={styles.pageStatus} role="status" aria-atomic="true">
              {`Mostrando ${pageStart}–${pageEnd} de ${tabTotal}`}
            </p>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageButton}
                disabled={!canPrev}
                onClick={() => setOffset((current) => Math.max(0, current - PARTNERSHIP_PAGE_SIZE))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={styles.pageButton}
                disabled={!canNext}
                onClick={() => setOffset((current) => current + PARTNERSHIP_PAGE_SIZE)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={holdConfirmId !== null}
        title="Poner en hold"
        body="Se pausan pedidos nuevos de delivery. Los envíos en camino siguen. El menú digital deja de ofrecer entrega hasta que reactives."
        confirmLabel="Poner en hold"
        confirming={holdConfirmId !== null && reassigningId === holdConfirmId}
        onCancel={() => {
          if (reassigningId !== holdConfirmId) setHoldConfirmId(null);
        }}
        onConfirm={() => {
          if (holdConfirmId) void handleHoldChange(holdConfirmId, true);
        }}
      />
    </PanelPageShell>
  );
}
