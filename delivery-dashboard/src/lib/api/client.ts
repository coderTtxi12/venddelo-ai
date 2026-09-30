import { ApiError, type ApiErrorBody } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';
export { API_URL };

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  /** Extra attempts after the first failure (network/429/5xx only). */
  retries?: number;
  /** Abort the request after this many milliseconds (monitor/slow reads). */
  timeoutMs?: number;
};

function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  if (error.code === 'network_error') {
    return true;
  }
  return error.status === 429 || error.status >= 500;
}

function retryDelayMs(attempt: number): number {
  const base = 1_000 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(base + jitter, 12_000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function apiRequestOnce<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const controller = options.timeoutMs ? new AbortController() : null;
  const timeoutId =
    controller && options.timeoutMs
      ? window.setTimeout(() => controller.abort(), options.timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      signal: controller?.signal,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'timeout',
        'El backend tardó demasiado en responder. Intenta de nuevo en unos segundos.',
        0,
      );
    }
    throw new ApiError(
      'network_error',
      `No se pudo conectar con el backend (${API_URL}). Verifica que esté en marcha.`,
      0,
    );
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = data as ApiErrorBody | null;
    const code = err?.error?.code ?? 'unknown_error';
    let message = err?.error?.message ?? response.statusText;
    if (response.status === 429) {
      message =
        'El backend está saturado (demasiadas peticiones). Espera unos segundos y recarga.';
    }
    throw new ApiError(code, message, response.status);
  }

  return data as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await apiRequestOnce<T>(path, options);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableApiError(error)) {
        throw error;
      }
      await sleep(retryDelayMs(attempt));
    }
  }
  throw lastError;
}
