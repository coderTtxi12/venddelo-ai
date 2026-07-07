'use client';

import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import ChatStreamProcessing from '@/components/assistant/ChatStreamProcessing';
import {
  WORKFLOW_PHASES,
  phaseStatus,
  type WorkflowPhaseId,
  type WorkflowTelemetryState,
} from '@/lib/assistant/workflowTelemetry';
import styles from './AssistantWorkflowTelemetry.module.css';

const PHASE_LABELS: Record<WorkflowPhaseId, string> = {
  context: 'Preparando contexto',
  planning: 'Planificando',
  executing: 'Ejecutando plan',
  evaluating: 'Evaluando resultados',
  replanning: 'Ajustando plan',
  responding: 'Redactando respuesta',
};

type AssistantWorkflowTelemetryProps = {
  telemetry: WorkflowTelemetryState;
  showPhaseRail?: boolean;
};

function StepStatusIcon({ status }: { status: 'pending' | 'active' | 'done' }) {
  if (status === 'done') {
    return (
      <span className={`${styles.stepIcon} ${styles.stepIconDone}`} aria-hidden>
        <CheckCircleOutlineOutlinedIcon fontSize="inherit" />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className={`${styles.stepIcon} ${styles.stepIconActive}`} aria-hidden>
        <AutorenewOutlinedIcon fontSize="inherit" />
      </span>
    );
  }
  return (
    <span className={`${styles.stepIcon} ${styles.stepIconPending}`} aria-hidden>
      <RadioButtonUncheckedOutlinedIcon fontSize="inherit" />
    </span>
  );
}

function PhaseStatusIcon({ status }: { status: 'pending' | 'active' | 'done' }) {
  if (status === 'done') {
    return (
      <span className={`${styles.phaseIcon} ${styles.phaseIconDone}`} aria-hidden>
        <CheckCircleOutlineOutlinedIcon fontSize="inherit" />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className={`${styles.phaseIcon} ${styles.phaseIconActive}`} aria-hidden>
        <AutorenewOutlinedIcon fontSize="inherit" />
      </span>
    );
  }
  return (
    <span className={`${styles.phaseIcon} ${styles.phaseIconPending}`} aria-hidden>
      <RadioButtonUncheckedOutlinedIcon fontSize="inherit" />
    </span>
  );
}

export default function AssistantWorkflowTelemetry({
  telemetry,
  showPhaseRail = true,
}: AssistantWorkflowTelemetryProps) {
  const activePhaseLabel = telemetry.activePhase
    ? PHASE_LABELS[telemetry.activePhase]
    : undefined;
  const showPlan = Boolean(telemetry.planSummary && telemetry.steps.length > 0);
  const showEvaluation =
    telemetry.evaluation !== null && telemetry.activePhase === 'evaluating';
  const showReplanPhase =
    telemetry.planReplan ||
    telemetry.activePhase === 'replanning' ||
    telemetry.completedPhases.includes('replanning');

  const visiblePhases = WORKFLOW_PHASES.filter(
    (phase) => phase.id !== 'replanning' || showReplanPhase,
  );

  if (!telemetry.activePhase && !showPlan) {
    return null;
  }

  return (
    <div className={styles.panel} aria-live="polite" aria-label="Progreso del asistente">
      {telemetry.activePhase && !telemetry.isStreamingResponse ? (
        <ChatStreamProcessing label={activePhaseLabel} />
      ) : null}

      {showPhaseRail ? (
        <ol className={styles.phaseRail} aria-label="Fases del agente">
          {visiblePhases.map((phase, index) => {
            const status = phaseStatus(phase.id, telemetry);
            const isLast = index === visiblePhases.length - 1;

            return (
              <li key={phase.id} className={styles.phaseItem}>
                <div className={styles.phaseMarker}>
                  <PhaseStatusIcon status={status} />
                  {!isLast ? (
                    <span
                      className={`${styles.phaseConnector} ${
                        status === 'done' ? styles.phaseConnectorDone : ''
                      }`}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div className={styles.phaseContent}>
                  <p
                    className={`${styles.phaseLabel} ${
                      status === 'active'
                        ? styles.phaseLabelActive
                        : status === 'done'
                          ? styles.phaseLabelDone
                          : ''
                    }`}
                  >
                    {PHASE_LABELS[phase.id]}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {showPlan ? (
        <section className={styles.planCard} aria-label="Plan de trabajo">
          <div className={styles.planHeader}>
            <p className={styles.planTitle}>Plan</p>
            {telemetry.planReplan ? (
              <span className={styles.planReplanBadge}>Ajustado</span>
            ) : null}
          </div>
          <p className={styles.planSummary}>{telemetry.planSummary}</p>
          <ol className={styles.stepList}>
            {telemetry.steps.map((step, index) => (
              <li key={step.id} className={styles.stepItem}>
                <StepStatusIcon status={step.status} />
                <div className={styles.stepBody}>
                  <p
                    className={`${styles.stepGoal} ${
                      step.status === 'active' ? styles.stepGoalActive : ''
                    }`}
                  >
                    {index + 1}. {step.goal}
                  </p>
                  {step.tool_hint ? (
                    <p className={styles.stepMeta}>Tool: {step.tool_hint}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {showEvaluation && telemetry.evaluation ? (
        <div
          className={`${styles.evaluation} ${
            telemetry.evaluation.ok ? styles.evaluationOk : styles.evaluationFail
          }`}
        >
          <span className={styles.evaluationIcon} aria-hidden>
            {telemetry.evaluation.ok ? (
              <CheckCircleOutlineOutlinedIcon fontSize="inherit" />
            ) : (
              <ErrorOutlineOutlinedIcon fontSize="inherit" />
            )}
          </span>
          <p className={styles.evaluationText}>
            {telemetry.evaluation.ok
              ? 'Evaluación correcta. Preparando respuesta…'
              : telemetry.evaluation.issues[0] ?? 'El plan necesita ajustes.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
