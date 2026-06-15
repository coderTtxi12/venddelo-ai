const DEFAULT_MAX_RETRIES = 3;

/**
 * Ejecuta una función asíncrona con hasta maxRetries reintentos en caso de fallo.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
    }
  }
  throw lastError;
}
