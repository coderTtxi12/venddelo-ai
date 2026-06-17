'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import StarOutlineOutlinedIcon from '@mui/icons-material/StarOutlineOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
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
  { label: 'Órdenes', path: '/orders', icon: <ShoppingBagOutlinedIcon fontSize="small" />, badge: 24 },
  { label: 'Productos', path: '/products', icon: <Inventory2OutlinedIcon fontSize="small" /> },
  { label: 'Menú Digital', path: '/digital-menu', icon: <QrCode2OutlinedIcon fontSize="small" /> },
  { label: 'Reseñas', path: '/reviews', icon: <StarOutlineOutlinedIcon fontSize="small" />, badge: 14 },
  { label: 'Analíticas', path: '/analytics', icon: <BarChartOutlinedIcon fontSize="small" /> },
  { label: 'Marketing', path: '/marketing', icon: <CampaignOutlinedIcon fontSize="small" /> },
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
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
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

      <button className={styles.addButton}>+ Agregar</button>
    </aside>
  );
}
