'use client';

import { useCallback, useMemo } from 'react';

export function useServerClock(serverNowIso: string | null | undefined) {
  const offsetMs = useMemo(() => {
    if (!serverNowIso) return 0;
    return new Date(serverNowIso).getTime() - Date.now();
  }, [serverNowIso]);

  const now = useCallback(() => new Date(Date.now() + offsetMs), [offsetMs]);

  return { now, offsetMs };
}
