'use client';

import { useState } from 'react';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import type { RestaurantSchedule } from '@/lib/api/types';
import { buildRestaurantHoursBlocks, type ServiceHoursBlock } from '@/lib/restaurantScheduleHours';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import styles from './RestaurantHoursFooter.module.css';

type RestaurantHoursDisplayProps = {
  schedules: RestaurantSchedule[];
  serviceTypes?: RestaurantServiceType[];
  className?: string;
  variant?: 'default' | 'sidebar';
};

function DayHoursReadout({ day }: { day: ServiceHoursBlock['days'][number] }) {
  return (
    <li className={`${styles.dayRow} ${day.isToday ? styles.dayRowToday : ''}`}>
      <div className={styles.dayMeta}>
        <span className={styles.dayLabel}>
          {day.label}
          {day.isToday ? <span className={styles.todayBadge}>Hoy</span> : null}
        </span>
      </div>
      {day.isClosed ? (
        <p className={styles.closedHint}>Cerrado</p>
      ) : (
        <ul className={styles.readoutSlots}>
          {day.slots.map((slot) => (
            <li key={slot} className={styles.readoutSlot}>
              {slot}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ServiceHoursReadout({
  block,
  expanded,
  onToggle,
}: {
  block: ServiceHoursBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = `hours-readout-${block.serviceType}`;
  const openDays = block.days.filter((day) => !day.isClosed).length;
  const summary =
    openDays === 0
      ? 'Sin días con servicio'
      : openDays === 7
        ? 'Abierto los 7 días'
        : `${openDays} ${openDays === 1 ? 'día abierto' : 'días abiertos'}`;

  return (
    <div className={`${styles.hoursBlock} ${expanded ? styles.hoursBlockOpen : ''}`}>
      <button
        type="button"
        className={styles.serviceToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={styles.serviceToggleMain}>
          <span className={styles.serviceTitle}>{block.label}</span>
          {!expanded ? <span className={styles.serviceSummary}>{summary}</span> : null}
        </span>
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
        </span>
      </button>

      <div id={panelId} className={styles.servicePanel} hidden={!expanded}>
        <ul className={styles.dayList}>
          {block.days.map((day) => (
            <DayHoursReadout key={`${block.serviceType}-${day.dayIndex}`} day={day} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RestaurantHoursDisplay({
  schedules,
  serviceTypes,
  className,
  variant = 'default',
}: RestaurantHoursDisplayProps) {
  const blocks = buildRestaurantHoursBlocks(schedules, serviceTypes ?? []);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<RestaurantServiceType, boolean>>({
    delivery: true,
    takeout: false,
  });

  if (blocks.length === 0) return null;

  return (
    <section
      className={`${styles.hoursSection} ${variant === 'sidebar' ? styles.hoursSectionSidebar : ''} ${className ?? ''}`.trim()}
      aria-label="Horario del restaurante"
    >
      <div className={styles.hoursHeader}>
        <AccessTimeOutlinedIcon className={styles.hoursIcon} aria-hidden />
        <div className={styles.hoursHeading}>
          <h2 className={styles.hoursTitle}>Horarios de Servicio</h2>
          {variant === 'default' ? (
            <p className={styles.hoursHint}>Consulta nuestros horarios por tipo de entrega.</p>
          ) : null}
        </div>
      </div>

      <div className={styles.hoursBlocks}>
        {blocks.map((block) => (
          <ServiceHoursReadout
            key={block.serviceType}
            block={block}
            expanded={expandedBlocks[block.serviceType]}
            onToggle={() =>
              setExpandedBlocks((current) => ({
                ...current,
                [block.serviceType]: !current[block.serviceType],
              }))
            }
          />
        ))}
      </div>
    </section>
  );
}
