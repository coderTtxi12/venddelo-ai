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
  callId?: string;
  tool: string;
  skillId?: string;
  effect?: string;
  argsSummary?: Record<string, unknown>;
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

export type AgentLoadedSkill = {
  id: string;
  label: string;
};

export type AgentActivityState = {
  phase: AgentActivityPhase | null;
  status: string | null;
  thoughts: AgentThought[];
  planReason: string | null;
  planSteps: AgentPlanStep[];
  latestReflection: AgentReflection | null;
  loadedSkills: AgentLoadedSkill[];
  tools: AgentToolStep[];
};

export const INITIAL_AGENT_ACTIVITY: AgentActivityState = {
  phase: null,
  status: null,
  thoughts: [],
  planReason: null,
  planSteps: [],
  latestReflection: null,
  loadedSkills: [],
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
  loadedSkills: [],
  tools: [],
};

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'Analizando tu mensaje',
  explore: 'Consultando tu menú',
  planning: 'Cargando guías y contexto',
  plan: 'Planificando pasos',
  preview: 'Preparando vista previa',
  confirm: 'Esperando confirmación',
  execute: 'Aplicando cambios',
};

const DECISION_LABELS: Record<AgentPlanDecision, string> = {
  continue: 'Continuando con el plan',
  replan: 'Ajustando el plan',
  finish: 'Plan completado',
};

const TOOL_LABELS: Record<string, string> = {
  load_skill: 'Cargando guía de skill',
  list_categories: 'Listando categorías',
  list_products: 'Listando productos',
  search_products: 'Buscando productos',
  get_product: 'Obteniendo producto',
  list_promotions: 'Listando promociones',
  get_promotion: 'Obteniendo promoción',
  list_product_promotions: 'Revisando promociones del producto',
  update_product: 'Actualizando producto',
  create_product: 'Creando producto',
  bulk_update_product_names: 'Renombrando productos',
  bulk_update_product_descriptions: 'Actualizando descripciones',
  bulk_update_product_prices: 'Actualizando precios',
  update_category: 'Actualizando categoría',
  create_category: 'Creando categoría',
  set_category_product_order: 'Reordenando productos',
  add_option_group: 'Agregando grupo de opciones',
  update_option_group: 'Actualizando grupo de opciones',
  add_option_item: 'Agregando opción',
  update_option_item: 'Actualizando opción',
};

const EFFECT_LABELS: Record<string, string> = {
  read: 'Consulta',
  mutate: 'Cambio',
};

export function labelForAgentPhase(phase: string | null): string | null {
  if (!phase) return null;
  return PHASE_LABELS[phase] ?? `Fase: ${phase}`;
}

export function labelForPlanDecision(decision: AgentPlanDecision): string {
  return DECISION_LABELS[decision];
}

export function labelForToolEffect(effect: string | undefined): string | null {
  if (!effect) return null;
  return EFFECT_LABELS[effect] ?? effect;
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

export function mapPlanStepsFromPayload(steps: unknown): AgentPlanStep[] {
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
    activity.loadedSkills.length > 0 ||
    activity.latestReflection !== null
  );
}

export function summarizeAgentActivity(activity: AgentActivityState): string {
  const parts: string[] = [];
  if (activity.tools.length > 0) {
    parts.push(
      `${activity.tools.length} acción${activity.tools.length === 1 ? '' : 'es'}`,
    );
  }
  if (activity.loadedSkills.length > 0) {
    parts.push(
      `${activity.loadedSkills.length} guía${activity.loadedSkills.length === 1 ? '' : 's'}`,
    );
  }
  if (activity.planSteps.length > 0) {
    parts.push(`${activity.planSteps.length} pasos`);
  }
  if (activity.thoughts.length > 0 && parts.length === 0) {
    parts.push(`${activity.thoughts.length} paso${activity.thoughts.length === 1 ? '' : 's'}`);
  }
  return parts.join(' · ') || 'Actividad del asistente';
}

export function updateToolStepResult(
  tools: AgentToolStep[],
  payload: { call_id?: string; tool: string; ok: boolean; summary?: string },
): AgentToolStep[] {
  const status: AgentToolStepStatus = payload.ok ? 'done' : 'error';
  let matched = false;
  return tools.map((step) => {
    if (matched) return step;
    const callMatch = payload.call_id && step.callId === payload.call_id;
    const fallbackMatch = !payload.call_id && step.tool === payload.tool && step.status === 'running';
    if (!callMatch && !fallbackMatch) return step;
    matched = true;
    return {
      ...step,
      status,
      summary: payload.summary ?? step.summary,
    };
  });
}

export function mergeLoadedSkills(
  current: AgentLoadedSkill[],
  incoming: AgentLoadedSkill[],
  activeIds: string[],
): AgentLoadedSkill[] {
  const byId = new Map(current.map((skill) => [skill.id, skill]));
  for (const skill of incoming) {
    byId.set(skill.id, skill);
  }
  return activeIds
    .map((id) => byId.get(id))
    .filter((skill): skill is AgentLoadedSkill => Boolean(skill));
}
