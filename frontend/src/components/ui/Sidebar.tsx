'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardOutlinedIcon fontSize="small" /> },
  { label: 'Órdenes', path: '/orders', icon: <ShoppingBagOutlinedIcon fontSize="small" /> },
  { label: 'Productos', path: '/products', icon: <Inventory2OutlinedIcon fontSize="small" /> },
  { label: 'Menú Digital', path: '/digital-menu', icon: <QrCode2OutlinedIcon fontSize="small" /> },
  { label: 'Horario', path: '/hours', icon: <AccessTimeOutlinedIcon fontSize="small" /> },
  { label: 'Marketing', path: '/marketing', icon: <CampaignOutlinedIcon fontSize="small" /> },
  { label: 'Configuración', path: '/settings', icon: <SettingsOutlinedIcon fontSize="small" /> },
];

function isNavActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Por debajo de este ancho el sidebar arranca compactado. */
const SIDEBAR_COMPACT_MAX_WIDTH = 1024;

function shouldSidebarStartCollapsed(width: number): boolean {
  return width < SIDEBAR_COMPACT_MAX_WIDTH;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { pendingOrdersCount } = useRestaurantOrders();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(shouldSidebarStartCollapsed(window.innerWidth));
  }, []);

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.headerRow}>
        <div className={styles.logo}>Venddelo AI</div>
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
          const badgeCount =
            item.path === '/orders' && pendingOrdersCount > 0 ? pendingOrdersCount : null;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              aria-label={
                badgeCount != null ? `${item.label}, ${badgeCount} pedidos nuevos` : item.label
              }
            >
              <span className={styles.icon}>
                {item.icon}
                {badgeCount != null && isCollapsed ? (
                  <span className={styles.badgeDot} aria-hidden />
                ) : null}
              </span>
              <span className={styles.label}>{item.label}</span>
              {badgeCount != null && !isCollapsed ? (
                <span className={`${styles.badge} ${styles.badgeUrgent}`}>{badgeCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <button className={styles.addButton}>+ Agregar</button>
    </aside>
  );
}
