'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import styles from './ZonePicker.module.css';

export default function ZonePicker() {
  const pathname = usePathname();
  const listId = useId();
  const { loading, zones, selectedZoneId, selectedZone, setSelectedZoneId } = useDeliveryZone();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedIndex = useMemo(
    () => Math.max(0, zones.findIndex((zone) => zone.id === selectedZoneId)),
    [selectedZoneId, zones],
  );

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  const selectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setOpen(false);
  };

  const moveActive = (delta: number) => {
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return zones.length - 1;
      if (next >= zones.length) return 0;
      return next;
    });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, zones.length - 1));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const zone = zones[activeIndex];
      if (zone) selectZone(zone.id);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  if (pathname === '/repartidores' || pathname === '/asignacion' || zones.length === 0) return null;

  const activeId = zones[activeIndex] ? `${listId}-${zones[activeIndex].id}` : undefined;
  const disabled = loading || !selectedZoneId;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <span className={styles.label} id={`${listId}-label`}>
        Zona
      </span>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`.trim()}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label ${listId}-value`}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span id={`${listId}-value`} className={styles.value}>
          {selectedZone?.name ?? 'Selecciona una zona'}
        </span>
        <ExpandMoreOutlinedIcon
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`.trim()}
          sx={{ fontSize: 18 }}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={listId}
          className={styles.menu}
          role="listbox"
          aria-labelledby={`${listId}-label`}
          aria-activedescendant={activeId}
        >
          {zones.map((zone, index) => {
            const selected = zone.id === selectedZoneId;
            const active = index === activeIndex;
            return (
              <li key={zone.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${zone.id}`}
                  tabIndex={-1}
                  role="option"
                  aria-selected={selected}
                  className={`${styles.option} ${active ? styles.optionActive : ''} ${selected ? styles.optionSelected : ''}`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectZone(zone.id)}
                >
                  <span className={styles.optionName}>{zone.name}</span>
                  {selected ? (
                    <CheckOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
