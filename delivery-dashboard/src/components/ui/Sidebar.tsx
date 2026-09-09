'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import TwoWheelerOutlinedIcon from '@mui/icons-material/TwoWheelerOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { MOBILE_DRAWER_MAX_WIDTH, useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { SIDEBAR_NAV_SECTIONS } from '@/lib/nav/sidebarNav';
import styles from './Sidebar.module.css';

const NAV_ICONS: Record<string, ReactNode> = {
  '/monitor': <QueryStatsOutlinedIcon fontSize="small" />,
  '/historial': <HistoryOutlinedIcon fontSize="small" />,
  '/estadisticas': <BarChartOutlinedIcon fontSize="small" />,
  '/partnerships': <HandshakeOutlinedIcon fontSize="small" />,
  '/repartidores': <TwoWheelerOutlinedIcon fontSize="small" />,
  '/asignacion': <AssignmentOutlinedIcon fontSize="small" />,
  '/tariffs': <LocalShippingOutlinedIcon fontSize="small" />,
  '/horarios': <AccessTimeOutlinedIcon fontSize="small" />,
  '/cerco-geografico': <MapOutlinedIcon fontSize="small" />,
  '/settings': <SettingsOutlinedIcon fontSize="small" />,
};

function isNavActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Por debajo de este ancho el sidebar arranca compactado (solo desktop/tablet landscape). */
const SIDEBAR_COMPACT_MAX_WIDTH = 1024;

function shouldSidebarStartCollapsed(width: number): boolean {
  return width < SIDEBAR_COMPACT_MAX_WIDTH && width > MOBILE_DRAWER_MAX_WIDTH;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { isMobileDrawer, isDrawerOpen, closeDrawer } = useMobileSidebar();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(shouldSidebarStartCollapsed(window.innerWidth));
  }, []);

  useEffect(() => {
    if (isMobileDrawer) closeDrawer();
  }, [pathname, isMobileDrawer, closeDrawer]);

  const showCollapsed = !isMobileDrawer && isCollapsed;
  const showLabels = isMobileDrawer || !isCollapsed;

  return (
    <>
      {isMobileDrawer && isDrawerOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Cerrar menú"
          onClick={closeDrawer}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={[
          styles.sidebar,
          showCollapsed ? styles.collapsed : '',
          isMobileDrawer ? styles.mobileDrawer : '',
          isMobileDrawer && isDrawerOpen ? styles.mobileDrawerOpen : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={isMobileDrawer && !isDrawerOpen ? true : undefined}
      >
        <div className={styles.headerRow}>
          <div className={styles.logo}>Mexy Dashboard</div>
          {isMobileDrawer ? (
            <button
              type="button"
              className={styles.closeButton}
              onClick={closeDrawer}
              aria-label="Cerrar menú"
            >
              <CloseOutlinedIcon fontSize="small" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-label={isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
            >
              <span className={styles.toggleIcon}>{isCollapsed ? '»' : '«'}</span>
            </button>
          )}
        </div>

        <nav className={styles.nav} aria-label="Navegación principal">
          {SIDEBAR_NAV_SECTIONS.map((section) => (
            <section key={section.id} className={styles.navSection} aria-labelledby={`nav-${section.id}`}>
              {showLabels ? (
                <h2 id={`nav-${section.id}`} className={styles.sectionLabel}>
                  {section.label}
                </h2>
              ) : (
                <h2 id={`nav-${section.id}`} className={styles.sectionLabelSr}>
                  {section.label}
                </h2>
              )}
              {section.items.map((item) => {
                const active = isNavActive(pathname, item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`${styles.navItem} ${active ? styles.active : ''}`}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    title={showLabels ? undefined : item.label}
                    onClick={() => {
                      if (isMobileDrawer) closeDrawer();
                    }}
                  >
                    <span className={styles.icon} aria-hidden="true">
                      {NAV_ICONS[item.path]}
                    </span>
                    {showLabels ? <span className={styles.label}>{item.label}</span> : null}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>
    </>
  );
}
