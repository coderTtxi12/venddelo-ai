import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  labelForAgentPhase,
  labelForTool,
  type AgentActivityState,
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

export default function ChatAgentActivity({
  activity,
  showProcessingDots = false,
}: ChatAgentActivityProps) {
  const phaseLabel = labelForAgentPhase(activity.phase);
  const hasTools = activity.tools.length > 0;
  const isProcessing = activity.status === 'processing' || showProcessingDots;

  if (!phaseLabel && !hasTools && !isProcessing) {
    return null;
  }

  return (
    <div
      className={styles.activity}
      role="status"
      aria-live="polite"
      aria-label="Actividad del asistente"
    >
      {phaseLabel ? (
        <div className={styles.phaseRow}>
          <SearchOutlinedIcon sx={{ fontSize: 14 }} aria-hidden className={styles.phaseIcon} />
          <span className={styles.phaseLabel}>{phaseLabel}</span>
          {isProcessing && !hasTools ? <span className={styles.phasePulse} aria-hidden /> : null}
        </div>
      ) : null}

      {hasTools ? (
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
      ) : null}
    </div>
  );
}
