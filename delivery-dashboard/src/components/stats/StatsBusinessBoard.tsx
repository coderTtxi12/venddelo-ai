'use client';

import { useMemo, useState } from 'react';
import { StatsBusinessLines } from '@/components/stats/StatsBusinessLines';
import type { DispatchStatsRestaurant } from '@/lib/api/types';
import {
  filterBusinessOrders,
  sortBusinessOrders,
  toBusinessOrderRows,
  type BusinessHoldFilter,
} from '@/lib/dispatch/businessOrders';
import styles from './StatsBusinessBoard.module.css';

const HOLD_FILTERS: Array<{ id: BusinessHoldFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Sin hold' },
  { id: 'hold', label: 'En hold' },
];

type StatsBusinessBoardProps = {
  restaurants: DispatchStatsRestaurant[];
  labels: string[];
};

export function StatsBusinessBoard({ restaurants, labels }: StatsBusinessBoardProps) {
  const [hold, setHold] = useState<BusinessHoldFilter>('all');
  const [query, setQuery] = useState('');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const rows = sortBusinessOrders(toBusinessOrderRows(restaurants, labels.length));
    return filterBusinessOrders(rows, hold, query);
  }, [hold, labels.length, query, restaurants]);

  const focusId = hoverId ?? (visible.some((row) => row.id === pinnedId) ? pinnedId : null);

  return (
    <section className={styles.board} aria-labelledby="business-orders-title">
      <header className={styles.header}>
        <div>
          <h2 id="business-orders-title" className={styles.title}>
            Pedidos por negocio
          </h2>
          <p className={styles.subtitle}>
            Cada línea es un negocio. Si no tuvo pedidos en el periodo, queda en cero.
          </p>
        </div>
        <p className={styles.total}>
          {visible.length} {visible.length === 1 ? 'negocio' : 'negocios'}
        </p>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Hold">
          {HOLD_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.chip} ${hold === option.id ? styles.chipActive : ''}`}
              aria-pressed={hold === option.id}
              onClick={() => setHold(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <span className={styles.searchLabel}>Buscar</span>
          <input
            type="search"
            value={query}
            placeholder="Nombre del negocio"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <StatsBusinessLines labels={labels} rows={visible} focusId={focusId} />

      {visible.length === 0 ? (
        <p className={styles.empty}>Ningún negocio con este filtro.</p>
      ) : (
        <div className={styles.listWrap}>
          <div className={styles.columns} aria-hidden>
            <span>Negocio</span>
            <span>Pedidos</span>
          </div>
          <ul className={styles.list}>
            {visible.map((row) => {
              const selected = focusId === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
                    aria-pressed={pinnedId === row.id}
                    onMouseEnter={() => setHoverId(row.id)}
                    onMouseLeave={() => setHoverId((current) => (current === row.id ? null : current))}
                    onFocus={() => setHoverId(row.id)}
                    onBlur={() => setHoverId((current) => (current === row.id ? null : current))}
                    onClick={() => setPinnedId((current) => (current === row.id ? null : row.id))}
                  >
                    <span
                      className={styles.swatch}
                      style={{ background: row.orderCount === 0 && !selected ? '#cbd5e1' : row.color }}
                      aria-hidden
                    />
                    <span className={styles.name}>
                      <span className={styles.nameText}>{row.name}</span>
                      {row.onHold ? <span className={styles.hold}>Hold</span> : null}
                    </span>
                    <span className={styles.count}>{row.orderCount}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
