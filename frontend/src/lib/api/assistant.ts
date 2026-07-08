import { ApiError } from './types';
import { isFetchAbortError } from './assistantStream';
import type { ChatAttachmentRef } from './assistantImport';
import type { StepStatus, WorkflowPhaseId } from '@/lib/assistant/workflowTelemetry';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type AssistantChatRequest = {
  message: string;
  conversation_id?: string | null;
  attachments?: ChatAttachmentRef[];
};

export type AssistantStreamCompletePayload = {
  conversation_id: string;
  content: string;
  menu_import?: MenuImportQuizPayload | null;
};

export type MenuImportQuizOption = {
  id: string;
  label: string;
};

export type MenuImportQuizQuestion = {
  id: string;
  question: string;
  suggested_answers: MenuImportQuizOption[];
  allow_other?: boolean;
};

export type MenuImportQuizPayload = {
  questions: MenuImportQuizQuestion[];
};

export type AssistantStreamErrorPayload = {
  code: string;
  message: string;
};

export type AssistantStreamHandlers = {
  onDelta: (delta: string) => void;
  onComplete: (payload: AssistantStreamCompletePayload) => void;
  onError: (payload: AssistantStreamErrorPayload) => void;
  onAgentStatus?: (status: string) => void;
  onAgentPhase?: (payload: { phase: WorkflowPhaseId; label: string }) => void;
  onAgentPlan?: (payload: {
    summary: string;
    steps: Array<{ id: string; goal: string; tool_hint?: string | null }>;
    replan?: boolean;
  }) => void;
  onAgentStep?: (payload: {
    step_id: string;
    index: number;
    goal: string;
    tool_hint?: string | null;
    status: StepStatus;
  }) => void;
  onAgentEvaluation?: (payload: {
    ok: boolean;
    should_replan: boolean;
    issues: string[];
  }) => void;
  onToolStart?: (payload: {
    tool: string;
    call_id?: string;
    args_summary?: Record<string, unknown>;
    effect?: string;
  }) => void;
  onToolResult?: (payload: {
    tool: string;
    call_id?: string;
    ok: boolean;
    summary?: string;
  }) => void;
  onAgentThought?: (payload: {
    text?: string;
    delta?: string;
    source?: string;
  }) => void;
  onMenuImportQuiz?: (payload: MenuImportQuizPayload) => void;
};

function parseMenuImportQuizPayload(raw: unknown): MenuImportQuizPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const questions = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const parsedQuestions: MenuImportQuizQuestion[] = [];
  for (const item of questions) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = record.id;
    const question = record.question;
    const suggested = record.suggested_answers;
    if (typeof id !== 'string' || typeof question !== 'string' || !Array.isArray(suggested)) {
      continue;
    }
    const suggestedAnswers: MenuImportQuizOption[] = [];
    for (const option of suggested) {
      if (!option || typeof option !== 'object') continue;
      const optionRecord = option as Record<string, unknown>;
      if (typeof optionRecord.id !== 'string' || typeof optionRecord.label !== 'string') {
        continue;
      }
      suggestedAnswers.push({ id: optionRecord.id, label: optionRecord.label });
    }
    if (suggestedAnswers.length === 0) continue;
    parsedQuestions.push({
      id,
      question,
      suggested_answers: suggestedAnswers,
      allow_other: record.allow_other !== false,
    });
  }

  if (parsedQuestions.length === 0) return null;
  return { questions: parsedQuestions };
}

function parseMenuImportQuizEvent(payload: Record<string, unknown>): MenuImportQuizPayload | null {
  const direct = parseMenuImportQuizPayload({ questions: payload.questions });
  if (direct) return direct;
  return parseMenuImportQuizPayload(payload.menu_import);
}

const WORKFLOW_PHASES = new Set<WorkflowPhaseId>([
  'context',
  'routing',
  'executing',
  'evaluating',
  'responding',
]);

function parseSseBlock(block: string): { event: string; data: string } | null {
  if (!block.trim()) return null;

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

export async function streamAssistantChat(
  token: string,
  restaurantId: string,
  body: AssistantChatRequest,
  handlers: AssistantStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/restaurants/${restaurantId}/assistant/chat`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || isFetchAbortError(error)) {
      return;
    }
    throw new ApiError(
      'network_error',
      `No se pudo conectar con el backend (${API_URL}). Verifica que esté en marcha.`,
      0,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = response.statusText;
    try {
      const parsed = text ? JSON.parse(text) : null;
      errorMessage = parsed?.error?.message ?? errorMessage;
    } catch {
      if (text) errorMessage = text;
    }
    throw new ApiError('assistant_chat_error', errorMessage, response.status);
  }

  if (!response.body) {
    throw new ApiError('assistant_chat_error', 'El servidor no devolvió un stream.', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const markFinished = () => {
    finished = true;
  };

  while (!finished) {
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch (error) {
      if (signal?.aborted || isFetchAbortError(error)) {
        return;
      }
      throw error;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const parsed = parseSseBlock(block.trim());
      if (!parsed) continue;

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(parsed.data) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (parsed.event === 'content.delta') {
        const delta = payload.delta;
        if (typeof delta === 'string' && delta) {
          handlers.onDelta(delta);
        }
        continue;
      }

      if (parsed.event === 'agent.status') {
        const status = payload.status;
        if (typeof status === 'string') {
          handlers.onAgentStatus?.(status);
        }
        continue;
      }

      if (parsed.event === 'agent.phase') {
        const phase = payload.phase;
        const label = payload.label;
        if (typeof phase === 'string' && typeof label === 'string' && WORKFLOW_PHASES.has(phase as WorkflowPhaseId)) {
          handlers.onAgentPhase?.({ phase: phase as WorkflowPhaseId, label });
        }
        continue;
      }

      if (parsed.event === 'agent.plan' || parsed.event === 'agent.plan_update') {
        const summary = payload.summary;
        const steps = payload.steps;
        if (typeof summary === 'string' && Array.isArray(steps)) {
          handlers.onAgentPlan?.({
            summary,
            steps: steps as Array<{ id: string; goal: string; tool_hint?: string | null }>,
            replan: parsed.event === 'agent.plan_update' || payload.replan === true,
          });
        }
        continue;
      }

      if (parsed.event === 'agent.step') {
        const stepId = payload.step_id;
        const goal = payload.goal;
        const status = payload.status;
        const index = payload.index;
        if (
          typeof stepId === 'string' &&
          typeof goal === 'string' &&
          typeof status === 'string' &&
          typeof index === 'number' &&
          (status === 'pending' || status === 'active' || status === 'done')
        ) {
          handlers.onAgentStep?.({
            step_id: stepId,
            index,
            goal,
            tool_hint: typeof payload.tool_hint === 'string' ? payload.tool_hint : null,
            status,
          });
        }
        continue;
      }

      if (parsed.event === 'agent.evaluation') {
        handlers.onAgentEvaluation?.({
          ok: payload.ok === true,
          should_replan: payload.should_replan === true,
          issues: Array.isArray(payload.issues)
            ? payload.issues.filter((item): item is string => typeof item === 'string')
            : [],
        });
        continue;
      }

      if (parsed.event === 'tool.start') {
        const tool = payload.tool;
        if (typeof tool === 'string') {
          handlers.onToolStart?.({
            tool,
            call_id: typeof payload.call_id === 'string' ? payload.call_id : undefined,
            args_summary:
              payload.args_summary && typeof payload.args_summary === 'object'
                ? (payload.args_summary as Record<string, unknown>)
                : undefined,
            effect: typeof payload.effect === 'string' ? payload.effect : undefined,
          });
        }
        continue;
      }

      if (parsed.event === 'tool.result') {
        const tool = payload.tool;
        if (typeof tool === 'string') {
          handlers.onToolResult?.({
            tool,
            call_id: typeof payload.call_id === 'string' ? payload.call_id : undefined,
            ok: payload.ok !== false,
            summary: typeof payload.summary === 'string' ? payload.summary : undefined,
          });
        }
        continue;
      }

      if (parsed.event === 'agent.thought') {
        handlers.onAgentThought?.({
          text: typeof payload.text === 'string' ? payload.text : undefined,
          delta: typeof payload.delta === 'string' ? payload.delta : undefined,
          source: typeof payload.source === 'string' ? payload.source : undefined,
        });
        continue;
      }

      if (parsed.event === 'menu_import.quiz') {
        const quiz = parseMenuImportQuizEvent(payload);
        if (quiz) {
          handlers.onMenuImportQuiz?.(quiz);
        }
        continue;
      }

      if (parsed.event === 'message.complete') {
        const quiz = parseMenuImportQuizEvent(payload);
        handlers.onComplete({
          conversation_id: String(payload.conversation_id ?? body.conversation_id ?? ''),
          content: String(payload.content ?? ''),
          menu_import: quiz,
        });
        markFinished();
        break;
      }

      if (parsed.event === 'error') {
        handlers.onError({
          code: String(payload.code ?? 'assistant_error'),
          message: String(payload.message ?? 'Error del asistente'),
        });
        markFinished();
        break;
      }
    }
  }

  try {
    await reader.cancel();
  } catch {
    // Stream may already be closed.
  }
}
