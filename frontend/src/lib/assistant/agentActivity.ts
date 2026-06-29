export type AgentActivityPhase =
  | 'analyzing'
  | 'explore'
  | 'plan'
  | 'preview'
  | 'confirm'
  | 'execute'
  | string;

export type AgentToolStepStatus = 'running' | 'done' | 'error';

export type AgentToolStep = {
  id: string;
  tool: string;
  skillId?: string;
  status: AgentToolStepStatus;
  summary?: string;
};

export type AgentActivityState = {
  phase: AgentActivityPhase | null;
  status: string | null;
  tools: AgentToolStep[];
};

export const INITIAL_AGENT_ACTIVITY: AgentActivityState = {
  phase: null,
  status: null,
  tools: [],
};

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'Analizando tu mensaje',
  explore: 'Consultando tu menú',
  plan: 'Planificando acciones',
  preview: 'Preparando vista previa',
  confirm: 'Esperando confirmación',
  execute: 'Aplicando cambios',
};

const TOOL_LABELS: Record<string, string> = {
  list_categories: 'Listando categorías',
  search_products: 'Buscando productos',
  get_product: 'Obteniendo producto',
};

export function labelForAgentPhase(phase: string | null): string | null {
  if (!phase) return null;
  return PHASE_LABELS[phase] ?? `Fase: ${phase}`;
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
