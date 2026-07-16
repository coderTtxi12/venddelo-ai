'use client';

import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import { useAuth } from '@/hooks/useAuth';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import DashboardSearch from '@/components/ui/DashboardSearch';
import styles from './TopBar.module.css';

export default function TopBar() {
  const { user, logout } = useAuth();
  const { isMobileDrawer, isDrawerOpen, toggleDrawer } = useMobileSidebar();

  return (
    <header className={styles.topbar}>
      {isMobileDrawer ? (
        <button
          type="button"
          className={styles.menuButton}
          onClick={toggleDrawer}
          aria-label={isDrawerOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={isDrawerOpen}
          aria-controls="app-sidebar"
        >
          <MenuOutlinedIcon fontSize="small" />
        </button>
      ) : null}

      <DashboardSearch />

      <div className={styles.actions}>
        <div className={styles.userInfo}>
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {user?.displayName?.[0] ?? 'U'}
            </div>
          )}
          <div className={styles.userText}>
            <span className={styles.userName}>{user?.displayName ?? 'Admin'}</span>
            <span className={styles.userRole}>Administrador</span>
          </div>
        </div>

        <button className={styles.logoutButton} onClick={() => void logout()} title="Cerrar sesión">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
