import { ApiError, type ApiErrorBody } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
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

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      'network_error',
      `No se pudo conectar con el backend (${API_URL}). Verifica que esté en marcha.`,
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = data as ApiErrorBody | null;
    throw new ApiError(
      err?.error?.code ?? 'unknown_error',
      err?.error?.message ?? response.statusText,
      response.status,
    );
  }

  return data as T;
}
