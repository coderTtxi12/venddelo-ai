import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useState } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
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
  { label: 'Reseñas', path: '/reviews', icon: <StarOutlineIcon fontSize="small" />, badge: 14 },
  { label: 'Analíticas', path: '/analytics', icon: <BarChartOutlinedIcon fontSize="small" /> },
  { label: 'Marketing', path: '/marketing', icon: <CampaignOutlinedIcon fontSize="small" /> },
  { label: 'Configuración', path: '/settings', icon: <SettingsOutlinedIcon fontSize="small" /> },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.headerRow}>
        <div className={styles.logo}>Tienda Go</div>
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
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
            {item.badge != null && (
              <span className={styles.badge}>{item.badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <button className={styles.addButton}>+ Agregar</button>
    </aside>
  );
}
