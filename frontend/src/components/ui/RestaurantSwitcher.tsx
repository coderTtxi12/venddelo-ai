'use client';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useEffect, useId, useRef, useState } from 'react';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import styles from './RestaurantSwitcher.module.css';

type RestaurantSwitcherProps = {
  collapsed: boolean;
  layout?: 'default' | 'toolbar';
};

function restaurantInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : 'R';
}

export default function RestaurantSwitcher({
  collapsed,
  layout = 'default',
}: RestaurantSwitcherProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const {
    accessibleRestaurants,
    selectedRestaurantId,
    selectedRestaurantName,
    memberRole,
    canSwitchRestaurants,
    switching,
    switchRestaurant,
  } = useRestaurantAccess();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!canSwitchRestaurants) {
    return null;
  }

  const activeItem =
    accessibleRestaurants.find((item) => item.restaurant.id === selectedRestaurantId) ??
    accessibleRestaurants[0];
  const roleLabel =
    activeItem?.member_role === 'owner'
      ? 'Propietario'
      : memberRole === 'owner'
        ? 'Propietario'
        : 'Administrador';

  const handleSelect = (restaurantId: string) => {
    if (restaurantId === selectedRestaurantId) {
      setOpen(false);
      return;
    }
    void switchRestaurant(restaurantId).finally(() => setOpen(false));
  };

  return (
    <div
      className={`${styles.root} ${collapsed ? styles.rootCollapsed : styles.rootExpanded} ${
        layout === 'toolbar' ? styles.rootToolbar : ''
      }`}
      ref={rootRef}
    >
      {collapsed ? (
        <button
          type="button"
          className={`${styles.triggerCompact} ${open ? styles.triggerOpen : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={switching}
          title={selectedRestaurantName ?? 'Cambiar restaurante'}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={styles.triggerAvatar} aria-hidden="true">
            {restaurantInitial(activeItem?.restaurant.name ?? 'R')}
          </span>
          <StorefrontOutlinedIcon className={styles.triggerIcon} fontSize="inherit" aria-hidden="true" />
          <span className={styles.triggerCount} aria-hidden="true">
            {accessibleRestaurants.length}
          </span>
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.triggerExpanded} ${open ? styles.triggerOpen : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={switching}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={styles.triggerExpandedAvatar} aria-hidden="true">
            {restaurantInitial(activeItem?.restaurant.name ?? 'R')}
          </span>
          <span className={styles.triggerExpandedBody}>
            <span className={styles.triggerExpandedName}>
              {selectedRestaurantName ?? 'Selecciona restaurante'}
            </span>
            <span className={styles.triggerExpandedMeta}>{roleLabel}</span>
          </span>
          <KeyboardArrowDownRoundedIcon
            className={`${styles.triggerExpandedChevron} ${open ? styles.triggerExpandedChevronOpen : ''}`}
            fontSize="small"
            aria-hidden="true"
          />
        </button>
      )}

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Seleccionar restaurante"
          className={`${styles.menu} ${collapsed ? styles.menuCollapsed : styles.menuExpanded}`}
        >
          <div className={styles.menuHeader}>
            <span className={styles.menuEyebrow}>Restaurante activo</span>
            <span className={styles.menuTitle}>
              {selectedRestaurantName ?? 'Selecciona uno'}
            </span>
          </div>

          <ul className={styles.menuList}>
            {accessibleRestaurants.map((item) => {
              const isSelected = item.restaurant.id === selectedRestaurantId;
              return (
                <li key={item.restaurant.id} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    className={`${styles.menuItem} ${isSelected ? styles.menuItemSelected : ''}`}
                    disabled={switching}
                    onClick={() => handleSelect(item.restaurant.id)}
                  >
                    <span className={styles.menuItemAvatar} aria-hidden="true">
                      {restaurantInitial(item.restaurant.name)}
                    </span>
                    <span className={styles.menuItemBody}>
                      <span className={styles.menuItemName}>{item.restaurant.name}</span>
                      <span className={styles.menuItemMeta}>
                        {item.member_role === 'owner' ? 'Propietario' : 'Administrador'}
                      </span>
                    </span>
                    {isSelected ? (
                      <CheckRoundedIcon className={styles.menuItemCheck} fontSize="small" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
