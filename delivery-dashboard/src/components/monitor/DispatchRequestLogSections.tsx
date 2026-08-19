import {
  ASSIGNMENT_LOG_EMPTY,
  ASSIGNMENT_LOG_ERROR,
  ASSIGNMENT_LOG_LOADING,
  caseLabel,
  formatTimelineTime,
  timelineEventTitle,
  timelineEventTone,
} from '@/lib/dispatch/monitorCopy';
import type { AssignmentLogEvent, DispatchMonitorTimelineEvent } from '@/lib/api/types';
import styles from './RequestDetailDrawer.module.css';

function assignmentEventToneClass(tone: string, isNow: boolean): string {
  if (isNow) return styles.toneNow;
  if (tone === 'ok') return styles.toneOk;
  if (tone === 'warn') return styles.toneWarn;
  return styles.toneNeutral;
}

type DispatchRequestLogSectionsProps = {
  timeline: DispatchMonitorTimelineEvent[];
  blockers?: string | null;
  eligibleCount?: number;
  schedulerLines?: string[];
  logError: string | null;
  logLoading: boolean;
  hasLog: boolean;
  assignmentEvents: AssignmentLogEvent[];
  highlightLast?: boolean;
};

export function DispatchRequestLogSections({
  timeline,
  blockers,
  eligibleCount = 0,
  schedulerLines = [],
  logError,
  logLoading,
  hasLog,
  assignmentEvents,
  highlightLast = false,
}: DispatchRequestLogSectionsProps) {
  return (
    <>
      <section className={styles.section} aria-labelledby="request-detail-operacion">
        <h3 id="request-detail-operacion" className={styles.heading}>
          Operación
        </h3>
        {timeline.length === 0 ? (
          <p className={styles.empty}>Sin eventos todavía.</p>
        ) : (
          <ol className={styles.timeline}>
            {timeline.map((event, index) => {
              const tone = timelineEventTone(event);
              const caseText = caseLabel(event.case_applied);
              const toneClass =
                tone === 'now'
                  ? styles.toneNow
                  : tone === 'warn'
                    ? styles.toneWarn
                    : tone === 'alert'
                      ? styles.toneAlert
                      : tone === 'ok'
                        ? styles.toneOk
                        : styles.toneNeutral;
              return (
                <li
                  key={`${event.kind}-${event.at ?? 'na'}-${event.driver_name ?? ''}-${index}`}
                  className={`${styles.step} ${toneClass}`}
                >
                  <time className={styles.time} dateTime={event.at ?? undefined}>
                    {formatTimelineTime(event.at)}
                  </time>
                  <span className={styles.marker} aria-hidden />
                  <span className={styles.event}>
                    <strong>{timelineEventTitle(event)}</strong>
                    {caseText ? <span>{caseText}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {blockers ? (
          <p className={styles.blockers}>
            {eligibleCount} candidatos · {blockers}
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="request-detail-asignacion">
        <h3 id="request-detail-asignacion" className={styles.heading}>
          Asignación
        </h3>
        {schedulerLines.length > 0 ? (
          <div className={styles.scheduler}>
            {schedulerLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
        {logError ? (
          <p className={styles.alert} role="alert">
            {logError}
          </p>
        ) : null}
        {logLoading && !hasLog ? (
          <p className={styles.empty}>{ASSIGNMENT_LOG_LOADING}</p>
        ) : assignmentEvents.length === 0 ? (
          logError && !hasLog ? null : (
            <p className={styles.empty}>{ASSIGNMENT_LOG_EMPTY}</p>
          )
        ) : (
          <ol className={styles.timeline}>
            {assignmentEvents.map((event, index) => {
              const isNow = highlightLast && index === assignmentEvents.length - 1;
              return (
                <li
                  key={event.id}
                  className={`${styles.step} ${assignmentEventToneClass(event.tone, isNow)}`}
                >
                  <time className={styles.time} dateTime={event.at}>
                    {formatTimelineTime(event.at)}
                  </time>
                  <span className={styles.marker} aria-hidden />
                  <span className={styles.event}>
                    <strong>{event.title}</strong>
                    {event.detail ? <span>{event.detail}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
