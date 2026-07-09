'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
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
  const { pendingOrdersCount, restaurantName } = useRestaurantOrders();
  const { isOpen: isChatOpen, openChat, closeChat } = useAssistantChat();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const wasChatOpenRef = useRef(false);

  useEffect(() => {
    setIsCollapsed(shouldSidebarStartCollapsed(window.innerWidth));
  }, []);

  useEffect(() => {
    if (isChatOpen && !wasChatOpenRef.current) {
      setIsCollapsed(true);
    }
    wasChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.headerRow}>
        <div className={styles.logo} title={restaurantName ?? undefined}>
          {restaurantName ?? 'Mi restaurante'}
        </div>
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

      <div className={styles.chatAction}>
        <button
          type="button"
          className={`${styles.addButton} ${isCollapsed ? styles.addButtonCompact : ''} ${
            isChatOpen ? styles.addButtonActive : ''
          }`}
          onClick={isChatOpen ? closeChat : openChat}
          aria-label={isChatOpen ? 'Cerrar asistente' : 'Abrir asistente'}
          title={isChatOpen ? 'Cerrar asistente' : 'Agregar con IA'}
        >
          <span className={styles.addButtonIcon} aria-hidden>
            <BrainOutlinedIcon sx={{ fontSize: isCollapsed ? 22 : 18 }} />
          </span>
          <span className={styles.addButtonLabel}>
            {isChatOpen ? 'Asistente' : 'Mexy AI'}
          </span>
        </button>
      </div>
    </aside>
  );
}
