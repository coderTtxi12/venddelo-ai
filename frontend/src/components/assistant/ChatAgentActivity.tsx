import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  hasVisibleAgentActivity,
  labelForAgentPhase,
  labelForPlanDecision,
  labelForTool,
  type AgentActivityState,
  type AgentPlanStepStatus,
  type AgentToolStepStatus,
} from '@/lib/assistant/agentActivity';
import styles from './ChatAgentActivity.module.css';

type ChatAgentActivityProps = {
  activity: AgentActivityState;
  showProcessingDots?: boolean;
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

export default function ChatAgentActivity({
  activity,
  showProcessingDots = false,
}: ChatAgentActivityProps) {
  const phaseLabel = labelForAgentPhase(activity.phase);
  const hasThoughts = activity.thoughts.length > 0;
  const hasPlan = activity.planSteps.length > 0;
  const hasTools = activity.tools.length > 0;
  const hasReflection = activity.latestReflection !== null;
  const isProcessing = activity.status === 'processing' || showProcessingDots;
  const latestThought = hasThoughts ? activity.thoughts[activity.thoughts.length - 1] : null;

  if (!hasVisibleAgentActivity(activity) && !showProcessingDots) {
    return null;
  }

  const currentPlanStepIndex = activity.planSteps.findIndex((step) => step.status === 'pending');

  return (
    <div
      className={styles.activity}
      role="status"
      aria-live="polite"
      aria-label="Actividad del asistente"
    >
      {phaseLabel ? (
        <div className={styles.phaseRow}>
          {activity.phase === 'planning' || activity.phase === 'plan' ? (
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
                  latestThought && thought.id === latestThought.id ? styles.thoughtItem_active : ''
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

      {hasTools ? (
        <section className={styles.toolsSection} aria-label="Consultas en curso">
          <div className={styles.sectionHeading}>
            <SearchOutlinedIcon sx={{ fontSize: 13 }} aria-hidden />
            <span>Consultando</span>
          </div>
          <ul className={styles.toolList}>
            {activity.tools.map((step) => (
              <li
                key={step.id}
                className={`${styles.toolItem} ${styles[`toolItem_${step.status}`]}`}
              >
                <span className={styles.toolIcon}>
                  <ToolIcon status={step.status} />
                </span>
                <span className={styles.toolText}>
                  <span className={styles.toolLabel}>{labelForTool(step.tool, step.status)}</span>
                  {step.summary && step.status !== 'running' ? (
                    <span className={styles.toolSummary}>{step.summary}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
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
    </div>
  );
}
