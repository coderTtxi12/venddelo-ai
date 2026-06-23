'use client';

import { useState } from 'react';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import type { DeliveryProviderSchedule } from '@/lib/api/types';
import {
  buildProviderScheduleBlocks,
  type KindScheduleDraft,
} from '@/lib/providerScheduleHours';
import styles from '@/components/digital-menu/RestaurantHoursFooter.module.css';

type DeliveryProviderHoursDisplayProps = {
  schedules: DeliveryProviderSchedule[];
  className?: string;
};

function kindBlockSummary(days: KindScheduleDraft['days']): string {
  const openDays = days.filter((day) => !day.isClosed).length;
  if (openDays === 0) return 'Sin días con reparto';
  if (openDays === 7) return 'Activo los 7 días';
  return `${openDays} ${openDays === 1 ? 'día activo' : 'días activos'}`;
}

function DayHoursReadout({ day }: { day: KindScheduleDraft['days'][number] }) {
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

function KindScheduleReadout({
  block,
  expanded,
  onToggle,
}: {
  block: KindScheduleDraft;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = `provider-hours-readout-${block.scheduleKind}`;

  return (
    <div
      className={`${styles.hoursBlock} ${expanded ? styles.hoursBlockOpen : ''} ${styles.hoursBlockReadOnly}`}
    >
      <button
        type="button"
        className={styles.serviceToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={styles.serviceToggleMain}>
          <span className={styles.serviceTitle}>
            {block.label}
            <span className={styles.readOnlyBadge}>Solo lectura</span>
          </span>
          {!expanded ? (
            <span className={styles.serviceSummary}>{kindBlockSummary(block.days)}</span>
          ) : null}
        </span>
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
        </span>
      </button>

      <div id={panelId} className={styles.servicePanel} hidden={!expanded}>
        <ul className={styles.dayList}>
          {block.days.map((day) => (
            <DayHoursReadout key={`${block.scheduleKind}-${day.dayIndex}`} day={day} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DeliveryProviderHoursDisplay({
  schedules,
  className,
}: DeliveryProviderHoursDisplayProps) {
  const blocks = buildProviderScheduleBlocks(schedules);
  const [expandedKind, setExpandedKind] = useState<string | null>('regular');

  if (blocks.every((block) => block.days.every((day) => day.isClosed))) {
    return (
      <p className={styles.closedHint}>
        El proveedor aún no ha configurado horarios de reparto.
      </p>
    );
  }

  return (
    <section
      className={`${styles.hoursSection} ${styles.hoursSectionReadOnly} ${className ?? ''}`.trim()}
      aria-label="Horario de entrega a domicilio"
    >
      <div className={styles.hoursBlocks}>
        {blocks.map((block) => (
          <KindScheduleReadout
            key={block.scheduleKind}
            block={block}
            expanded={expandedKind === block.scheduleKind}
            onToggle={() =>
              setExpandedKind((current) =>
                current === block.scheduleKind ? null : block.scheduleKind,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
