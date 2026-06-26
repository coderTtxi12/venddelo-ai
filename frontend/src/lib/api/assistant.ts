import { ApiError } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type AssistantChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantChatRequest = {
  message: string;
  history: AssistantChatHistoryMessage[];
};

export type AssistantStreamCompletePayload = {
  message_id: string;
  content: string;
};

export type AssistantStreamErrorPayload = {
  code: string;
  message: string;
};

export type AssistantStreamHandlers = {
  onDelta: (delta: string) => void;
  onComplete: (payload: AssistantStreamCompletePayload) => void;
  onError: (payload: AssistantStreamErrorPayload) => void;
};

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
  } catch {
    throw new ApiError(
      'network_error',
      `No se pudo conectar con el backend (${API_URL}). Verifica que esté en marcha.`,
      0,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    let message = response.statusText;
    try {
      const parsed = text ? JSON.parse(text) : null;
      message = parsed?.error?.message ?? message;
    } catch {
      if (text) message = text;
    }
    throw new ApiError('assistant_chat_error', message, response.status);
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

      if (parsed.event === 'message.complete') {
        handlers.onComplete({
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
