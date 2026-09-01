'use client';

import { Fragment, useId, useState, type ElementType } from 'react';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import styles from './InventoryExpirySelect.module.css';

export const EXPIRY_SELECT_OPTIONS = [
  {
    value: 'none',
    label: 'Sin caducidad',
    description: 'No se vence sola',
    Icon: BlockOutlinedIcon,
    group: 'none',
  },
  {
    value: 'today',
    label: 'Hoy',
    description: 'Caduca el día de hoy',
    Icon: TodayOutlinedIcon,
    group: 'preset',
  },
  {
    value: '1',
    label: '1 día',
    description: 'Vence en 1 día',
    Icon: ScheduleOutlinedIcon,
    group: 'preset',
  },
  {
    value: '2',
    label: '2 días',
    description: 'Vence en 2 días',
    Icon: ScheduleOutlinedIcon,
    group: 'preset',
  },
  {
    value: '7',
    label: '1 semana',
    description: 'Vence en 7 días',
    Icon: EventOutlinedIcon,
    group: 'preset',
  },
  {
    value: 'custom',
    label: 'Otro plazo',
    description: 'Escribe cuántos días',
    Icon: EditOutlinedIcon,
    group: 'custom',
  },
  {
    value: 'date',
    label: 'Fecha concreta',
    description: 'Elige el día exacto',
    Icon: CalendarMonthOutlinedIcon,
    group: 'custom',
  },
] as const;

type ExpirySelectValue = (typeof EXPIRY_SELECT_OPTIONS)[number]['value'];

export function InventoryExpirySelect({
  id,
  productName,
  value,
  disabled,
  invalid,
  warn,
  describedBy,
  onChange,
}: {
  id: string;
  productName: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  warn?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const menuId = useId();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);
  const selected =
    EXPIRY_SELECT_OPTIONS.find((option) => option.value === value) ?? EXPIRY_SELECT_OPTIONS[0];
  const SelectedIcon: ElementType = selected.Icon;

  function closeMenu() {
    setAnchorEl(null);
  }

  function choose(next: ExpirySelectValue) {
    onChange(next);
    closeMenu();
  }

  return (
    <div className={styles.wrap}>
      <button
        id={id}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${
          invalid ? styles.triggerInvalid : warn ? styles.triggerWarn : ''
        }`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Caducidad de ${productName}: ${selected.label}`}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          setAnchorEl(event.currentTarget);
        }}
      >
        <span className={styles.triggerIcon} aria-hidden="true">
          <SelectedIcon sx={{ fontSize: 18 }} />
        </span>
        <span className={styles.triggerLabel}>{selected.label}</span>
        <ExpandMoreOutlinedIcon
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          sx={{ fontSize: 18 }}
          aria-hidden
        />
      </button>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={closeMenu}
        disableScrollLock
        transitionDuration={{ enter: 140, exit: 90 }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            className: styles.paper,
            style: { minWidth: Math.max(anchorEl?.offsetWidth ?? 0, 248) },
          },
        }}
        MenuListProps={{
          id: `${menuId}-list`,
          autoFocusItem: open,
          className: styles.list,
          'aria-label': `Caducidad de ${productName}`,
        }}
      >
        {EXPIRY_SELECT_OPTIONS.map((option, index) => {
          const prev = EXPIRY_SELECT_OPTIONS[index - 1];
          const showDivider = Boolean(prev && prev.group !== option.group);
          const isSelected = option.value === selected.value;
          const Icon = option.Icon;
          return (
            <Fragment key={option.value}>
              {showDivider ? (
                <Divider className={styles.separator} component="li" />
              ) : null}
              <MenuItem
                className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                selected={isSelected}
                disableGutters
                onClick={(event) => {
                  event.stopPropagation();
                  choose(option.value);
                }}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  <Icon sx={{ fontSize: 18 }} />
                </span>
                <span className={styles.itemCopy}>
                  <span className={styles.itemLabel}>{option.label}</span>
                  <span className={styles.itemDescription}>{option.description}</span>
                </span>
                {isSelected ? (
                  <CheckOutlinedIcon className={styles.itemCheck} sx={{ fontSize: 18 }} aria-hidden />
                ) : (
                  <span className={styles.itemCheckSlot} aria-hidden="true" />
                )}
              </MenuItem>
            </Fragment>
          );
        })}
      </Menu>
    </div>
  );
}
