'use client';

import { useId, useState } from 'react';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import {
  DEFAULT_PRODUCT_TABLE_COLUMNS,
  PRODUCT_TABLE_COLUMN_IDS,
  PRODUCT_TABLE_COLUMN_LABELS,
  isLockedProductTableColumn,
  productTableColumnsMatchDefaults,
  type ProductTableColumnVisibility,
} from './productTableColumns';
import styles from './ProductsTableColumnsMenu.module.css';

export function ProductsTableColumnsMenu({
  visibility,
  onChange,
}: {
  visibility: ProductTableColumnVisibility;
  onChange: (next: ProductTableColumnVisibility) => void;
}) {
  const menuId = useId();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const canReset = !productTableColumnsMatchDefaults(visibility);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Elegir columnas de la tabla"
        onClick={(event) => {
          setAnchorEl(open ? null : event.currentTarget);
        }}
      >
        <span className={styles.triggerIcon} aria-hidden="true">
          <ViewColumnOutlinedIcon sx={{ fontSize: 18 }} />
        </span>
        Columnas
      </button>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        disableScrollLock
        transitionDuration={{ enter: 140, exit: 90 }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            className: styles.paper,
            style: { minWidth: Math.max(anchorEl?.offsetWidth ?? 0, 240) },
          },
        }}
        MenuListProps={{
          id: `${menuId}-list`,
          autoFocusItem: open,
          className: styles.list,
          'aria-label': 'Columnas visibles',
        }}
      >
        <li className={styles.heading} id={`${menuId}-heading`}>
          Mostrar en la tabla
        </li>
        {PRODUCT_TABLE_COLUMN_IDS.map((id) => {
          const locked = isLockedProductTableColumn(id);
          const on = visibility[id];
          return (
            <MenuItem
              key={id}
              className={`${styles.item} ${on ? styles.itemOn : ''} ${locked ? styles.itemLocked : ''}`}
              disableGutters
              disabled={locked}
              role={locked ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={locked ? undefined : on}
              aria-disabled={locked || undefined}
              onClick={(event) => {
                event.stopPropagation();
                if (locked) return;
                onChange({ ...visibility, [id]: !on, product: true });
              }}
            >
              <span
                className={`${styles.check} ${on ? styles.checkOn : ''} ${locked ? styles.checkLocked : ''}`}
                aria-hidden="true"
              >
                {on ? <CheckOutlinedIcon sx={{ fontSize: 14 }} /> : null}
              </span>
              <span className={styles.copy}>
                <span className={styles.label}>{PRODUCT_TABLE_COLUMN_LABELS[id]}</span>
                {locked ? <span className={styles.hint}>Siempre visible</span> : null}
              </span>
            </MenuItem>
          );
        })}
        {canReset ? (
          <>
            <Divider className={styles.separator} component="li" />
            <MenuItem
              className={styles.resetItem}
              disableGutters
              onClick={(event) => {
                event.stopPropagation();
                onChange({ ...DEFAULT_PRODUCT_TABLE_COLUMNS });
              }}
            >
              Restablecer columnas
            </MenuItem>
          </>
        ) : null}
      </Menu>
    </div>
  );
}
