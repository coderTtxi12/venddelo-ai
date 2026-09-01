'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { MOBILE_DRAWER_MAX_WIDTH, useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { prefetchKitchenOrders } from '@/lib/orders/kitchenOrdersCache';
import { getRestaurant } from '@/lib/api/restaurants';
import { isActiveDeliveryPartnership } from '@/lib/fetchActiveDeliveryProviderConfig';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import RestaurantSwitcher from '@/components/ui/RestaurantSwitcher';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Órdenes', path: '/orders', icon: <ShoppingBagOutlinedIcon fontSize="small" /> },
  { label: 'Historial', path: '/history', icon: <HistoryOutlinedIcon fontSize="small" /> },
  { label: 'Clientes', path: '/clientes', icon: <PeopleOutlinedIcon fontSize="small" /> },
  { label: 'Impresora', path: '/printer', icon: <PrintOutlinedIcon fontSize="small" /> },
  { label: 'Productos', path: '/products', icon: <Inventory2OutlinedIcon fontSize="small" /> },
  { label: 'Menú Digital', path: '/digital-menu', icon: <QrCode2OutlinedIcon fontSize="small" /> },
  { label: 'Horario', path: '/hours', icon: <AccessTimeOutlinedIcon fontSize="small" /> },
  { label: 'Delivery', path: '/delivery', icon: <LocalShippingOutlinedIcon fontSize="small" /> },
  { label: 'Analíticas', path: '/analytics', icon: <BarChartOutlinedIcon fontSize="small" /> },
  { label: 'Marketing', path: '/marketing', icon: <CampaignOutlinedIcon fontSize="small" /> },
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
  const { accessToken } = useAuth();
  const { pendingOrdersCount } = useRestaurantOrders();
  const { selectedRestaurantId, selectedRestaurantName, canSwitchRestaurants } =
    useRestaurantAccess();
  const { isOpen: isChatOpen, openChat, closeChat } = useAssistantChat();
  const { isMobileDrawer, isDrawerOpen, closeDrawer } = useMobileSidebar();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const wasChatOpenRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsCollapsed(shouldSidebarStartCollapsed(window.innerWidth));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (isChatOpen && !wasChatOpenRef.current && !isMobileDrawer) {
      setIsCollapsed(true);
    }
    wasChatOpenRef.current = isChatOpen;
  }, [isChatOpen, isMobileDrawer]);

  useEffect(() => {
    if (isMobileDrawer) closeDrawer();
  }, [pathname, isMobileDrawer, closeDrawer]);

  useEffect(() => {
    if (isMobileDrawer && isChatOpen) closeDrawer();
  }, [isMobileDrawer, isChatOpen, closeDrawer]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken || !selectedRestaurantId) {
      void Promise.resolve().then(() => {
        if (!cancelled) setShowDelivery(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const restaurant = await getRestaurant(accessToken, selectedRestaurantId);
        const partnership = await syncRestaurantDeliveryPartnership(
          accessToken,
          selectedRestaurantId,
          restaurant.delivery_enabled,
        );
        if (!cancelled) setShowDelivery(isActiveDeliveryPartnership(partnership));
      } catch {
        if (!cancelled) setShowDelivery(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedRestaurantId]);

  const showCollapsed = !isMobileDrawer && isCollapsed;
  const showLabels = isMobileDrawer || !isCollapsed;

  const prefetchOrders = () => {
    if (pathname.startsWith('/orders') || !accessToken || !selectedRestaurantId) return;
    void prefetchKitchenOrders(accessToken, selectedRestaurantId);
  };

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
        {canSwitchRestaurants ? (
          <div
            className={`${styles.headerToolbar} ${showCollapsed ? styles.headerToolbarCollapsed : ''}`}
          >
            <RestaurantSwitcher collapsed={showCollapsed} layout="toolbar" />
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
        ) : (
          <div className={styles.headerRow}>
            <div className={styles.logo} title={selectedRestaurantName ?? undefined}>
              {selectedRestaurantName ?? 'Mi restaurante'}
            </div>
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
        )}

        <nav className={styles.nav}>
          {navItems.filter((item) => item.path !== '/delivery' || showDelivery).map((item) => {
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
                onMouseEnter={item.path === '/orders' ? prefetchOrders : undefined}
                onFocus={item.path === '/orders' ? prefetchOrders : undefined}
                onClick={() => {
                  if (isMobileDrawer) closeDrawer();
                }}
              >
                <span className={styles.icon}>
                  {item.icon}
                  {badgeCount != null && showCollapsed ? (
                    <span className={styles.badgeDot} aria-hidden />
                  ) : null}
                </span>
                {showLabels ? <span className={styles.label}>{item.label}</span> : null}
                {badgeCount != null && showLabels ? (
                  <span className={`${styles.badge} ${styles.badgeUrgent}`}>{badgeCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className={styles.chatAction}>
          <button
            type="button"
            className={`${styles.addButton} ${showCollapsed ? styles.addButtonCompact : ''} ${
              isChatOpen ? styles.addButtonActive : ''
            }`}
            onClick={() => {
              if (isMobileDrawer) closeDrawer();
              if (isChatOpen) closeChat();
              else openChat();
            }}
            aria-label={isChatOpen ? 'Cerrar asistente' : 'Abrir asistente'}
            title={isChatOpen ? 'Cerrar asistente' : 'Agregar con IA'}
          >
            <span className={styles.addButtonIcon} aria-hidden>
              <BrainOutlinedIcon sx={{ fontSize: showCollapsed ? 22 : 18 }} />
            </span>
            {showLabels ? (
              <span className={styles.addButtonLabel}>
                {isChatOpen ? 'Asistente' : 'Mexy AI'}
              </span>
            ) : null}
          </button>
        </div>
      </aside>
    </>
  );
}
