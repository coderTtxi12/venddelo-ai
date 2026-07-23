'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { MOBILE_DRAWER_MAX_WIDTH, useMobileSidebar } from '@/contexts/MobileSidebarContext';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Restaurantes', path: '/partnerships', icon: <HandshakeOutlinedIcon fontSize="small" /> },
  { label: 'Tarifas', path: '/tariffs', icon: <LocalShippingOutlinedIcon fontSize="small" /> },
  { label: 'Horarios', path: '/horarios', icon: <AccessTimeOutlinedIcon fontSize="small" /> },
  { label: 'Cerco geográfico', path: '/cerco-geografico', icon: <MapOutlinedIcon fontSize="small" /> },
  { label: 'Configuración', path: '/settings', icon: <SettingsOutlinedIcon fontSize="small" /> },
];

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

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (isMobileDrawer) closeDrawer();
                }}
              >
                <span className={styles.icon}>{item.icon}</span>
                {showLabels ? <span className={styles.label}>{item.label}</span> : null}
                {item.badge != null && showLabels ? (
                  <span className={styles.badge}>{item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {!isMobileDrawer ? (
          <button type="button" className={styles.addButton}>
            + Agregar
          </button>
        ) : null}
      </aside>
    </>
  );
}
