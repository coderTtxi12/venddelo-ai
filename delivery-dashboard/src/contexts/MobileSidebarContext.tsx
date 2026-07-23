'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Below this width the sidebar is a slide-over drawer (no icon rail). */
export const MOBILE_DRAWER_MAX_WIDTH = 900;

type MobileSidebarContextValue = {
  isMobileDrawer: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const MobileSidebarContext = createContext<MobileSidebarContextValue | null>(null);

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [isMobileDrawer, setIsMobileDrawer] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_DRAWER_MAX_WIDTH}px)`);
    const sync = () => {
      const mobile = media.matches;
      setIsMobileDrawer(mobile);
      if (!mobile) setIsDrawerOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isMobileDrawer || !isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileDrawer, isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((open) => !open), []);

  const value = useMemo(
    () => ({
      isMobileDrawer,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    }),
    [isMobileDrawer, isDrawerOpen, openDrawer, closeDrawer, toggleDrawer],
  );

  return (
    <MobileSidebarContext.Provider value={value}>{children}</MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar(): MobileSidebarContextValue {
  const context = useContext(MobileSidebarContext);
  if (!context) {
    throw new Error('useMobileSidebar must be used within MobileSidebarProvider');
  }
  return context;
}
