'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type MenuScheduleClock = {
  now: Date;
  timezone: string;
};

const DEFAULT_TIMEZONE = 'America/Mexico_City';

const MenuScheduleClockContext = createContext<MenuScheduleClock | null>(null);

export function MenuScheduleClockProvider({
  now,
  timezone,
  children,
}: {
  now: Date;
  timezone: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ now, timezone }), [now, timezone]);
  return (
    <MenuScheduleClockContext.Provider value={value}>{children}</MenuScheduleClockContext.Provider>
  );
}

export function useMenuScheduleClock(): MenuScheduleClock {
  const clock = useContext(MenuScheduleClockContext);
  if (clock) return clock;
  return { now: new Date(), timezone: DEFAULT_TIMEZONE };
}
