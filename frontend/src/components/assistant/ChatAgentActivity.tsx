import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ExpandLessOutlinedIcon from '@mui/icons-material/ExpandLessOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  hasVisibleAgentActivity,
  labelForAgentPhase,
  labelForPlanDecision,
  labelForTool,
  labelForToolEffect,
  summarizeAgentActivity,
  type AgentActivityState,
  type AgentPlanStepStatus,
  type AgentToolStepStatus,
} from '@/lib/assistant/agentActivity';
import styles from './ChatAgentActivity.module.css';

type ChatAgentActivityProps = {
  activity: AgentActivityState;
  showProcessingDots?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  compact?: boolean;
};

function ToolIcon({ status }: { status: AgentToolStepStatus }) {
  if (status === 'done') {
    return <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />;
  }
  if (status === 'error') {
    return <ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />;
  }
  return <HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />;
}

function PlanStepIcon({ status }: { status: AgentPlanStepStatus }) {
  if (status === 'done') {
    return <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />;
  }
  if (status === 'skipped') {
    return <ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />;
  }
  return <HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />;
}

function formatArgsSummary(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  const query = args.query ?? args.name ?? args.product_name;
  if (typeof query === 'string' && query.trim()) {
    return `«${query.trim()}»`;
  }
  const skillId = args.skill_id;
  if (typeof skillId === 'string' && skillId.trim()) {
    return skillId;
  }
  const items = args.items ?? args.products;
  if (Array.isArray(items) && items.length > 0) {
    return `${items.length} ítem${items.length === 1 ? '' : 's'}`;
  }
  return null;
}

export default function ChatAgentActivity({
  activity,
  showProcessingDots = false,
  collapsed = false,
  onToggleCollapsed,
  compact = false,
}: ChatAgentActivityProps) {
  const phaseLabel = labelForAgentPhase(activity.phase);
  const hasThoughts = !compact && activity.thoughts.length > 0;
  const hasPlan = !compact && activity.planSteps.length > 0;
  const hasTools = activity.tools.length > 0;
  const hasPlanReason = Boolean(activity.planReason?.trim());
  const hasSkills = !compact && activity.loadedSkills.length > 0;
  const hasReflection = !compact && activity.latestReflection !== null;
  const showCompactReflection =
    compact && activity.latestReflection !== null && activity.latestReflection.decision === 'replan';
  const isProcessing = activity.status === 'processing' || showProcessingDots;
  const latestThought = hasThoughts ? activity.thoughts[activity.thoughts.length - 1] : null;
  const canCollapse = Boolean(onToggleCollapsed) && !isProcessing && !compact;
  const visibleTools = compact ? activity.tools.slice(-3) : activity.tools;

  if (!hasVisibleAgentActivity(activity) && !showProcessingDots) {
    return null;
  }

  if (compact && !phaseLabel && !hasTools && !hasPlanReason && !showCompactReflection && !showProcessingDots) {
    return null;
  }

  const currentPlanStepIndex = activity.planSteps.findIndex((step) => step.status === 'pending');
  const summary = summarizeAgentActivity(activity);

  return (
    <div
      className={`${styles.activity} ${collapsed ? styles.activity_collapsed : ''} ${
        compact ? styles.activity_compact : ''
      }`}
      role="status"
      aria-live="polite"
      aria-label="Actividad del asistente"
    >
      <div className={styles.headerRow}>
        <div className={styles.headerMain}>
          {phaseLabel ? (
            <div className={styles.phaseRow}>
              {activity.phase === 'routing' ||
              activity.phase === 'plan' ||
              activity.phase === 'execute' ? (
                <RouteOutlinedIcon sx={{ fontSize: 14 }} aria-hidden className={styles.phaseIcon} />
              ) : (
                <SearchOutlinedIcon sx={{ fontSize: 14 }} aria-hidden className={styles.phaseIcon} />
              )}
              <span className={styles.phaseLabel}>{phaseLabel}</span>
              {isProcessing && !hasTools && !hasPlan ? (
                <span className={styles.phasePulse} aria-hidden />
              ) : null}
            </div>
          ) : null}
          {compact && hasPlanReason ? (
            <p className={styles.planReasonCompact}>{activity.planReason}</p>
          ) : null}
          {canCollapse ? (
            <p className={styles.summaryLine}>{summary}</p>
          ) : null}
        </div>
        {canCollapse ? (
          <button
            type="button"
            className={styles.toggleButton}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mostrar actividad del asistente' : 'Ocultar actividad del asistente'}
          >
            {collapsed ? (
              <ExpandMoreOutlinedIcon sx={{ fontSize: 18 }} />
            ) : (
              <ExpandLessOutlinedIcon sx={{ fontSize: 18 }} />
            )}
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <>
          {hasThoughts ? (
            <section className={styles.thoughtSection} aria-label="Razonamiento del asistente">
              <div className={styles.sectionHeading}>
                <AutoAwesomeOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
                <span>Razonando</span>
              </div>
              <ul className={styles.thoughtList}>
                {activity.thoughts.map((thought) => (
                  <li
                    key={thought.id}
                    className={`${styles.thoughtItem} ${
                      latestThought && thought.id === latestThought.id
                        ? styles.thoughtItem_active
                        : ''
                    }`}
                  >
                    {thought.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasPlan ? (
            <section className={styles.planSection} aria-label="Plan del asistente">
              <div className={styles.sectionHeading}>
                <RouteOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
                <span>Plan</span>
              </div>
              {activity.planReason ? (
                <p className={styles.planReason}>{activity.planReason}</p>
              ) : null}
              <ol className={styles.planList}>
                {activity.planSteps.map((step, index) => {
                  const isCurrent =
                    step.status === 'pending' &&
                    (currentPlanStepIndex === -1 ? index === 0 : index === currentPlanStepIndex);
                  return (
                    <li
                      key={step.id}
                      className={`${styles.planItem} ${styles[`planItem_${step.status}`]} ${
                        isCurrent ? styles.planItem_current : ''
                      }`}
                    >
                      <span className={styles.planIcon}>
                        <PlanStepIcon status={step.status} />
                      </span>
                      <span className={styles.planText}>
                        <span className={styles.planGoal}>{step.goal}</span>
                        {step.toolHint ? (
                          <span className={styles.planHint}>{step.toolHint}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {hasSkills ? (
            <section className={styles.skillsSection} aria-label="Guías cargadas">
              <div className={styles.sectionHeading}>
                <MenuBookOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
                <span>Guías activas</span>
              </div>
              <ul className={styles.skillList}>
                {activity.loadedSkills.map((skill) => (
                  <li key={skill.id} className={styles.skillItem}>
                    <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
                    <span>{skill.label}</span>
                    <span className={styles.skillId}>{skill.id}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasTools ? (
            <section className={styles.toolsSection} aria-label="Acciones en curso">
              {!compact ? (
                <div className={styles.sectionHeading}>
                  <SearchOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
                  <span>Ejecutando</span>
                </div>
              ) : null}
              <ul className={styles.toolList}>
                {visibleTools.map((step) => {
                  const argsHint = formatArgsSummary(step.argsSummary);
                  const effectLabel = labelForToolEffect(step.effect);
                  return (
                    <li
                      key={step.id}
                      className={`${styles.toolItem} ${styles[`toolItem_${step.status}`]}`}
                    >
                      <span className={styles.toolIcon}>
                        <ToolIcon status={step.status} />
                      </span>
                      <span className={styles.toolText}>
                        <span className={styles.toolLabelRow}>
                          <span className={styles.toolLabel}>
                            {labelForTool(step.tool, step.status)}
                          </span>
                          {!compact && effectLabel ? (
                            <span
                              className={`${styles.effectBadge} ${
                                step.effect === 'mutate' ? styles.effectBadge_mutate : ''
                              }`}
                            >
                              {effectLabel}
                            </span>
                          ) : null}
                        </span>
                        {argsHint ? <span className={styles.toolArgs}>{argsHint}</span> : null}
                        {!compact && step.summary && step.status !== 'running' ? (
                          <span className={styles.toolSummary}>{step.summary}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {showCompactReflection ? (
            <section className={styles.reflectionSection} aria-label="Reevaluación del asistente">
              <div className={styles.sectionHeading}>
                <PsychologyOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
                <span>{labelForPlanDecision(activity.latestReflection!.decision)}</span>
              </div>
              {activity.latestReflection?.reason ? (
                <p className={styles.reflectionReason}>{activity.latestReflection.reason}</p>
              ) : null}
            </section>
          ) : null}

          {hasReflection ? (
            <section className={styles.reflectionSection} aria-label="Reevaluación del asistente">
              <div className={styles.sectionHeading}>
                <PsychologyOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
                <span>{labelForPlanDecision(activity.latestReflection!.decision)}</span>
              </div>
              {activity.latestReflection?.reason ? (
                <p className={styles.reflectionReason}>{activity.latestReflection.reason}</p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
