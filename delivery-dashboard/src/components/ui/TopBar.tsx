'use client';

import { useAuth } from '@/hooks/useAuth';
import ServiceStatusToggle from '@/components/ui/ServiceStatusToggle';
import styles from './TopBar.module.css';

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className={styles.topbar}>
      <div className={styles.searchBox}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" x2="16.65" y1="21" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Buscar productos, órdenes, vendedores..."
          className={styles.searchInput}
        />
      </div>

      <div className={styles.actions}>
        <ServiceStatusToggle />

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

        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => void logout()}
          title="Cerrar sesión"
        >
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
