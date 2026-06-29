export type AgentActivityPhase =
  | 'analyzing'
  | 'explore'
  | 'planning'
  | 'plan'
  | 'preview'
  | 'confirm'
  | 'execute'
  | string;

export type AgentToolStepStatus = 'running' | 'done' | 'error';

export type AgentPlanStepStatus = 'pending' | 'done' | 'skipped';

export type AgentPlanDecision = 'continue' | 'replan' | 'finish';

export type AgentPlanStep = {
  id: number;
  goal: string;
  toolHint?: string;
  status: AgentPlanStepStatus;
};

export type AgentToolStep = {
  id: string;
  tool: string;
  skillId?: string;
  status: AgentToolStepStatus;
  summary?: string;
};

export type AgentReflection = {
  decision: AgentPlanDecision;
  reason?: string;
};

export type AgentThought = {
  id: string;
  text: string;
};

export type AgentActivityState = {
  phase: AgentActivityPhase | null;
  status: string | null;
  thoughts: AgentThought[];
  planReason: string | null;
  planSteps: AgentPlanStep[];
  latestReflection: AgentReflection | null;
  tools: AgentToolStep[];
};

export const INITIAL_AGENT_ACTIVITY: AgentActivityState = {
  phase: null,
  status: null,
  thoughts: [],
  planReason: null,
  planSteps: [],
  latestReflection: null,
  tools: [],
};

/** Shown immediately when a turn starts, before the first SSE event arrives. */
export const STREAMING_AGENT_ACTIVITY: AgentActivityState = {
  phase: 'analyzing',
  status: 'processing',
  thoughts: [],
  planReason: null,
  planSteps: [],
  latestReflection: null,
  tools: [],
};

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'Analizando tu mensaje',
  explore: 'Consultando tu menú',
  planning: 'Planificando pasos',
  plan: 'Planificando pasos',
  preview: 'Preparando vista previa',
  confirm: 'Esperando confirmación',
  execute: 'Aplicando cambios',
};

const DECISION_LABELS: Record<AgentPlanDecision, string> = {
  continue: 'Continuando con el plan',
  replan: 'Ajustando el plan',
  finish: 'Listo para responder',
};

const TOOL_LABELS: Record<string, string> = {
  list_categories: 'Listando categorías',
  list_products: 'Listando productos',
  search_products: 'Buscando productos',
  get_product: 'Obteniendo producto',
  list_promotions: 'Listando promociones',
  get_promotion: 'Obteniendo promoción',
  list_product_promotions: 'Revisando promociones del producto',
};

export function labelForAgentPhase(phase: string | null): string | null {
  if (!phase) return null;
  return PHASE_LABELS[phase] ?? `Fase: ${phase}`;
}

export function labelForPlanDecision(decision: AgentPlanDecision): string {
  return DECISION_LABELS[decision];
}

export function labelForTool(tool: string, status: AgentToolStepStatus): string {
  const base = TOOL_LABELS[tool] ?? tool.replaceAll('_', ' ');
  if (status === 'running') return `${base}…`;
  if (status === 'error') return `${base} — error`;
  return base;
}

export function createToolStepId(tool: string): string {
  return `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createThoughtId(): string {
  return `thought-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function mapPlanStepsFromPayload(
  steps: unknown,
): AgentPlanStep[] {
  if (!Array.isArray(steps)) return [];
  const mapped: AgentPlanStep[] = [];
  for (const item of steps) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    const goal = row.goal;
    if (typeof id !== 'number' || typeof goal !== 'string') continue;
    const status = row.status;
    mapped.push({
      id,
      goal,
      toolHint: typeof row.tool_hint === 'string' ? row.tool_hint : undefined,
      status:
        status === 'done' || status === 'skipped' || status === 'pending'
          ? status
          : 'pending',
    });
  }
  return mapped;
}

export function hasVisibleAgentActivity(activity: AgentActivityState): boolean {
  return (
    activity.phase !== null ||
    activity.status === 'processing' ||
    activity.thoughts.length > 0 ||
    activity.planSteps.length > 0 ||
    activity.tools.length > 0 ||
    activity.latestReflection !== null
  );
}
