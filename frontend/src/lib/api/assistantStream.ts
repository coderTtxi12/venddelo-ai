export function isFetchAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    return (
      normalized.includes('bodystreambuffer was aborted') ||
      normalized.includes('the user aborted a request') ||
      normalized.includes('the operation was aborted')
    );
  }
  return false;
}
