import { ApiError } from './types';

export function putBlobWithProgress(
  url: string,
  body: Blob,
  options: {
    headers?: Record<string, string>;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      options.onProgress?.(event.loaded, event.lengthComputable ? event.total : 0);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(
        new ApiError(
          'upload_failed',
          xhr.responseText?.trim() || 'No se pudo subir el APK a storage.',
          xhr.status,
        ),
      );
    };
    xhr.onerror = () => {
      reject(
        new ApiError(
          'network_error',
          'No se pudo subir el APK a storage. Revisa la conexión e inténtalo de nuevo.',
          0,
        ),
      );
    };
    xhr.send(body);
  });
}

export function postFormWithProgress<T>(
  url: string,
  body: FormData,
  options: {
    token?: string | null;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json');
    if (options.token) {
      xhr.setRequestHeader('Authorization', `Bearer ${options.token}`);
    }
    xhr.upload.onprogress = (event) => {
      options.onProgress?.(event.loaded, event.lengthComputable ? event.total : 0);
    };
    xhr.onload = () => {
      const text = xhr.responseText;
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        reject(new ApiError('unknown_error', 'Respuesta inválida del servidor.', xhr.status));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      const err = data as { error?: { code?: string; message?: string } } | null;
      reject(
        new ApiError(
          err?.error?.code ?? 'unknown_error',
          err?.error?.message ?? xhr.statusText,
          xhr.status,
        ),
      );
    };
    xhr.onerror = () => {
      reject(
        new ApiError(
          'network_error',
          `No se pudo conectar con el backend (${url}). Verifica que esté en marcha.`,
          0,
        ),
      );
    };
    xhr.send(body);
  });
}
