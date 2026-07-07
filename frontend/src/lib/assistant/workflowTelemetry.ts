export const WORKFLOW_PHASES = [
  { id: 'context', label: 'Contexto' },
  { id: 'planning', label: 'Plan' },
  { id: 'executing', label: 'Ejecutar' },
  { id: 'evaluating', label: 'Evaluar' },
  { id: 'replanning', label: 'Ajustar' },
  { id: 'responding', label: 'Responder' },
] as const;

export type WorkflowPhaseId = (typeof WORKFLOW_PHASES)[number]['id'];

export type StepStatus = 'pending' | 'active' | 'done';

export type WorkflowPlanStep = {
  id: string;
  goal: string;
  tool_hint?: string | null;
  status: StepStatus;
};

export type WorkflowEvaluationState = {
  ok: boolean;
  shouldReplan: boolean;
  issues: string[];
};

export type WorkflowTelemetryState = {
  activePhase: WorkflowPhaseId | null;
  completedPhases: WorkflowPhaseId[];
  planSummary: string | null;
  planReplan: boolean;
  steps: WorkflowPlanStep[];
  evaluation: WorkflowEvaluationState | null;
  isStreamingResponse: boolean;
};

export const INITIAL_WORKFLOW_TELEMETRY: WorkflowTelemetryState = {
  activePhase: null,
  completedPhases: [],
  planSummary: null,
  planReplan: false,
  steps: [],
  evaluation: null,
  isStreamingResponse: false,
};

function phaseIndex(phase: WorkflowPhaseId): number {
  return WORKFLOW_PHASES.findIndex((item) => item.id === phase);
}

export function applyWorkflowPhase(
  state: WorkflowTelemetryState,
  phase: WorkflowPhaseId,
): WorkflowTelemetryState {
  const index = phaseIndex(phase);
  const completed = WORKFLOW_PHASES.slice(0, index).map((item) => item.id);
  return {
    ...state,
    activePhase: phase,
    completedPhases: completed,
    isStreamingResponse: phase === 'responding' ? state.isStreamingResponse : false,
  };
}

export function applyWorkflowPlan(
  state: WorkflowTelemetryState,
  payload: {
    summary: string;
    steps: Array<{ id: string; goal: string; tool_hint?: string | null }>;
    replan?: boolean;
  },
): WorkflowTelemetryState {
  return {
    ...state,
    planSummary: payload.summary,
    planReplan: payload.replan === true,
    steps: payload.steps.map((step) => ({
      id: step.id,
      goal: step.goal,
      tool_hint: step.tool_hint,
      status: 'pending',
    })),
    evaluation: payload.replan ? null : state.evaluation,
  };
}

export function applyWorkflowStep(
  state: WorkflowTelemetryState,
  payload: {
    step_id: string;
    status: StepStatus;
    goal?: string;
    tool_hint?: string | null;
  },
): WorkflowTelemetryState {
  const existing = state.steps.find((step) => step.id === payload.step_id);
  const nextStep: WorkflowPlanStep = {
    id: payload.step_id,
    goal: payload.goal ?? existing?.goal ?? payload.step_id,
    tool_hint: payload.tool_hint ?? existing?.tool_hint,
    status: payload.status,
  };

  const steps = existing
    ? state.steps.map((step) => (step.id === payload.step_id ? nextStep : step))
    : [...state.steps, nextStep];

  return { ...state, steps };
}

export function applyWorkflowEvaluation(
  state: WorkflowTelemetryState,
  payload: WorkflowEvaluationState,
): WorkflowTelemetryState {
  return { ...state, evaluation: payload };
}

export function markWorkflowStreaming(state: WorkflowTelemetryState): WorkflowTelemetryState {
  return {
    ...state,
    isStreamingResponse: true,
    activePhase: 'responding',
    completedPhases: WORKFLOW_PHASES.filter((item) => item.id !== 'responding').map(
      (item) => item.id,
    ),
    steps: state.steps.map((step) => ({ ...step, status: 'done' as const })),
  };
}

export function phaseStatus(
  phaseId: WorkflowPhaseId,
  state: WorkflowTelemetryState,
): 'pending' | 'active' | 'done' {
  if (state.activePhase === phaseId) return 'active';
  if (state.completedPhases.includes(phaseId)) return 'done';
  return 'pending';
}
