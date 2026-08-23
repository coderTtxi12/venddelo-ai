import { isFetchAbortError } from '../api/assistantStream';
import { ApiError } from '../api/types';
import {
  parseRestaurantDispatchSseBlock,
  type RestaurantDispatchSseEvent,
} from './restaurantDispatchSse';

type StreamOptions = {
  apiUrl: string;
  restaurantId: string;
  accessToken: string;
  signal?: AbortSignal;
  onOpen?: () => void;
  onEvent: (event: RestaurantDispatchSseEvent) => void;
};

export async function streamRestaurantDispatchEvents(options: StreamOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${options.apiUrl}/restaurants/${options.restaurantId}/dispatch/events`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${options.accessToken}`,
        },
        cache: 'no-store',
        signal: options.signal,
      },
    );
  } catch (error) {
    if (options.signal?.aborted || isFetchAbortError(error)) return;
    throw error;
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
    throw new ApiError('dispatch_sse_error', message, response.status);
  }

  if (!response.body) {
    throw new ApiError('dispatch_sse_error', 'El servidor no devolvió un stream.', 500);
  }

  options.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (error) {
        if (options.signal?.aborted || isFetchAbortError(error)) return;
        throw error;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const parsed = parseRestaurantDispatchSseBlock(block);
        if (parsed) options.onEvent(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
