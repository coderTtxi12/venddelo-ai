import { apiRequest } from './client';
import { fetchAllPages } from './pagination';
import { ApiError } from './types';
import type { CursorPage } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type AssistantConversation = {
  id: string;
  restaurant_id: string;
  title: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

export type AssistantMessage = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AssistantStreamCompletePayload = {
  conversation_id: string;
  message_id: string;
  content: string;
};

export type AssistantStreamErrorPayload = {
  code: string;
  message: string;
};

export type AssistantSkillCatalogEntry = {
  id: string;
  label: string;
  granted: boolean;
  enabled: boolean;
  effective: boolean;
  required_plan: string;
  lock_reason: string | null;
};

export type AssistantProfile = {
  restaurant_id: string;
  display_name: string;
  identity_markdown: string;
  behavior_markdown: string;
  menu_markdown: string;
  enabled_skill_ids: string[];
  granted_skill_ids: string[];
  effective_skill_ids: string[];
  skills_catalog: AssistantSkillCatalogEntry[];
  version: number;
  chat_ready: boolean;
  updated_at: string;
};

export type AssistantProfileUpdate = {
  display_name?: string;
  identity_markdown?: string;
  behavior_markdown?: string;
  menu_markdown?: string;
  enabled_skill_ids?: string[];
  expected_version: number;
};

export type AssistantProfileSnapshot = {
  display_name: string;
  identity_markdown: string;
  behavior_markdown: string;
  menu_markdown: string;
  enabled_skill_ids: string[];
};

export type AssistantChatStreamOptions = {
  profileVersion: number;
  profileSnapshot?: AssistantProfileSnapshot;
};

export type AssistantStreamHandlers = {
  onDelta: (delta: string) => void;
  onComplete: (payload: AssistantStreamCompletePayload) => void;
  onError: (payload: AssistantStreamErrorPayload) => void;
  onAgentPhase?: (phase: string) => void;
  onAgentStatus?: (status: string) => void;
};

export function getAssistantProfile(token: string, restaurantId: string) {
  return apiRequest<AssistantProfile>(`/restaurants/${restaurantId}/assistant/profile`, { token });
}

export function updateAssistantProfile(
  token: string,
  restaurantId: string,
  body: AssistantProfileUpdate,
) {
  return apiRequest<AssistantProfile>(`/restaurants/${restaurantId}/assistant/profile`, {
    method: 'PATCH',
    token,
    body,
  });
}

export function listAssistantConversations(
  token: string,
  restaurantId: string,
  limit = 30,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<AssistantConversation>>(
    `/restaurants/${restaurantId}/assistant/conversations?${params}`,
    { token },
  );
}

export function createAssistantConversation(token: string, restaurantId: string, title?: string) {
  return apiRequest<AssistantConversation>(`/restaurants/${restaurantId}/assistant/conversations`, {
    method: 'POST',
    token,
    body: title ? { title } : {},
  });
}

export function listAssistantMessages(
  token: string,
  restaurantId: string,
  conversationId: string,
  limit = 100,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<CursorPage<AssistantMessage>>(
    `/restaurants/${restaurantId}/assistant/conversations/${conversationId}/messages?${params}`,
    { token },
  );
}

export async function loadAllAssistantMessages(
  token: string,
  restaurantId: string,
  conversationId: string,
) {
  return fetchAllPages(
    (cursor) => listAssistantMessages(token, restaurantId, conversationId, 100, cursor),
    100,
  );
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n').filter(Boolean);
  let event = 'message';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }

  if (!data) return null;
  return { event, data };
}

export async function streamAssistantChat(
  token: string,
  restaurantId: string,
  conversationId: string,
  message: string,
  handlers: AssistantStreamHandlers,
  signal?: AbortSignal,
  options?: AssistantChatStreamOptions,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${API_URL}/restaurants/${restaurantId}/assistant/conversations/${conversationId}/chat`,
      {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          profile_version: options?.profileVersion ?? 1,
          profile_snapshot: options?.profileSnapshot,
        }),
        signal,
      },
    );
  } catch {
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
    const { done, value } = await reader.read();
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

      if (parsed.event === 'agent.phase') {
        const phase = payload.phase;
        if (typeof phase === 'string') {
          handlers.onAgentPhase?.(phase);
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

      if (parsed.event === 'message.complete') {
        handlers.onComplete({
          conversation_id: String(payload.conversation_id ?? conversationId),
          message_id: String(payload.message_id ?? ''),
          content: String(payload.content ?? ''),
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
