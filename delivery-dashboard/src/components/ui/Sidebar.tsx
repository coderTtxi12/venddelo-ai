'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardOutlinedIcon fontSize="small" /> },
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

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.headerRow}>
        <div className={styles.logo}>Delivery Dashboard</div>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
        >
          <span className={styles.toggleIcon}>{isCollapsed ? '»' : '«'}</span>
        </button>
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
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {item.badge != null && (
                <span className={styles.badge}>{item.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <button type="button" className={styles.addButton}>
        + Agregar
      </button>
    </aside>
  );
}
