'use client';

import { useEffect, useMemo, useState } from 'react';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { AffiliateGoalCharts } from '@/components/affiliates/AffiliateGoalCharts';
import { EntityFilterCombobox } from '@/components/history/EntityFilterCombobox';
import { useAuth } from '@/hooks/useAuth';
import { listAllActivePartnerships } from '@/lib/api/partnerships';
import type { DeliveryPartnershipRequest } from '@/lib/api/types';
import {
  AFFILIATE_EXCLUSIONS_KEY,
  AFFILIATE_GOAL,
  affiliateForecastSentence,
  buildAffiliateGoal,
  formatSpanishDay,
  formatWeeklyPace,
  mexicoDay,
  parseAffiliateExclusions,
  serializeAffiliateExclusions,
  type AffiliateRecord,
} from '@/lib/affiliates/affiliateGoal';
import styles from './AffiliateGoalPage.module.css';

function toRecords(items: DeliveryPartnershipRequest[]): AffiliateRecord[] {
  return items.map((item) => ({
    restaurantId: item.restaurant.id,
    activatedAt: item.activated_at ?? item.created_at,
    onHold: item.on_hold,
  }));
}

export default function AffiliateGoalPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<DeliveryPartnershipRequest[] | null>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExcludedIds(parseAffiliateExclusions(window.localStorage.getItem(AFFILIATE_EXCLUSIONS_KEY)));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setError(null);
    listAllActivePartnerships(accessToken)
      .then((page) => {
        if (!cancelled) setItems(page);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los restaurantes');
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const snapshot = useMemo(() => {
    if (!items || !ready) return null;
    return buildAffiliateGoal(toRecords(items), excludedIds, mexicoDay(new Date()));
  }, [excludedIds, items, ready]);

  const options = useMemo(
    () =>
      (items ?? [])
        .map((item) => ({ id: item.restaurant.id, label: item.restaurant.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [items],
  );

  function persistExclusions(ids: string[]) {
    setExcludedIds(ids);
    window.localStorage.setItem(AFFILIATE_EXCLUSIONS_KEY, serializeAffiliateExclusions(ids));
  }

  const loading = !snapshot && !error;
  const progress = snapshot ? Math.min(100, (snapshot.active / snapshot.goal) * 100) : 0;
  const progressLabel = Math.round(progress);
  const remaining = snapshot ? Math.max(0, snapshot.goal - snapshot.active) : AFFILIATE_GOAL;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>100 negocios</h1>
          <p className={styles.subtitle}>
            Restaurantes sin hold. Es la meta de Mexy: los primeros 100 afiliados activos.
          </p>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <p className={styles.loading} role="status">
          Cargando afiliados…
        </p>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.hero} aria-labelledby="affiliate-kpi-title">
            <div className={styles.kpi}>
              <div className={styles.kpiTop}>
                <div>
                  <p id="affiliate-kpi-title" className={styles.kpiLabel}>
                    Sin hold
                  </p>
                  <p className={styles.kpiValue}>
                    <span>{snapshot.active}</span>
                    <span className={styles.kpiGoal}>/ {snapshot.goal}</span>
                  </p>
                </div>
                <p className={`${styles.kpiPercent} ${snapshot.reached ? styles.kpiPercentDone : ''}`}>
                  {progressLabel}%
                </p>
              </div>
              <div
                className={styles.track}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={snapshot.goal}
                aria-valuenow={Math.min(snapshot.active, snapshot.goal)}
                aria-valuetext={`${progressLabel}%`}
                aria-label="Avance hacia 100 restaurantes sin hold"
              >
                <span
                  className={`${styles.fill} ${snapshot.reached ? styles.fillDone : ''}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className={styles.kpiFoot}>
                <span>{snapshot.reached ? 'Meta cubierta' : `Faltan ${remaining}`}</span>
                {snapshot.excluded > 0 ? (
                  <span className={styles.kpiAside}>
                    {snapshot.excluded} {snapshot.excluded === 1 ? 'prueba fuera' : 'pruebas fuera'}
                  </span>
                ) : null}
              </p>
            </div>

            <div className={styles.stats}>
              <article className={styles.stat}>
                <p className={styles.statLabel}>En hold</p>
                <p className={styles.statValue}>{snapshot.onHold}</p>
                <p className={styles.statHint}>
                  {snapshot.septemberHold} desde septiembre.
                </p>
              </article>
              <article className={styles.stat}>
                <p className={styles.statLabel}>Ritmo</p>
                <p className={styles.statValue}>{formatWeeklyPace(snapshot.weeklyNet)}</p>
                <p className={styles.statHint}>
                  Altas desde el 1 de septiembre que siguen sin hold.
                </p>
              </article>
              <article className={styles.stat}>
                <p className={styles.statLabel}>Llegada a 100</p>
                <p className={styles.statValue}>
                  {snapshot.reached
                    ? 'Hoy'
                    : snapshot.projectedDate
                      ? formatSpanishDay(snapshot.projectedDate)
                      : 'Sin fecha'}
                </p>
                <p className={styles.statHint}>
                  {snapshot.reached
                    ? 'La meta ya está cubierta.'
                    : snapshot.projectedDate
                      ? 'Aprox. la fecha de llegada a 100.'
                      : affiliateForecastSentence(snapshot)}
                </p>
              </article>
              <article className={styles.stat}>
                <p className={styles.statLabel}>Antes de septiembre</p>
                <p className={styles.statValue}>{snapshot.baselineActive}</p>
                <p className={styles.statHint}>
                  Ya operaban con Mexy. Agosto fue la carga inicial y no entra en el ritmo.
                </p>
              </article>
            </div>
          </section>

          <AffiliateGoalCharts snapshot={snapshot} />

          <p className={styles.note}>
            {snapshot.septemberJoined} altas desde septiembre, {snapshot.septemberHold} ya en hold. La
            fecha sigue a las que siguen activas. Lo que marques en excluir pruebas sale del conteo.
          </p>

          <details className={styles.excludeBox}>
            <summary>
              <span className={styles.excludeTitle}>
                Excluir pruebas
                {snapshot.excluded > 0 ? ` · ${snapshot.excluded}` : ''}
              </span>
              <span className={styles.excludeToggle}>
                <span className={styles.expandLabel}>Mostrar</span>
                <span className={styles.collapseLabel}>Ocultar</span>
                <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
              </span>
            </summary>
            <div className={styles.excludeField}>
              <span id="affiliate-exclude-label">Restaurantes de prueba</span>
              <EntityFilterCombobox
                id="affiliate-exclude"
                labelledBy="affiliate-exclude-label"
                options={options}
                selectedIds={excludedIds}
                mode="exclude"
                placeholder="Wild Rooster, pruebas…"
                allLabel="Quitar exclusiones"
                onChange={({ ids }) => persistExclusions(ids)}
              />
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
