'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { ALL_ZONES_ID, zoneColorForId } from '@/lib/dispatch/zoneColors';
import styles from './ZonePicker.module.css';

type ZoneOption = { id: string; name: string };

export default function ZonePicker() {
  const pathname = usePathname();
  const listId = useId();
  const { loading, zones, selectedZoneId, selectedZone, setSelectedZoneId } = useDeliveryZone();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const zoneIds = useMemo(() => zones.map((zone) => zone.id), [zones]);
  const options = useMemo<ZoneOption[]>(() => {
    const zoneOptions = zones.map((zone) => ({ id: zone.id, name: zone.name }));
    if (pathname === '/monitor' || selectedZoneId === ALL_ZONES_ID) {
      return [{ id: ALL_ZONES_ID, name: 'Todas' }, ...zoneOptions];
    }
    return zoneOptions;
  }, [pathname, selectedZoneId, zones]);

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.id === selectedZoneId)),
    [options, selectedZoneId],
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
      if (next < 0) return options.length - 1;
      if (next >= options.length) return 0;
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
      setActiveIndex(Math.max(0, options.length - 1));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = options[activeIndex];
      if (option) selectZone(option.id);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  if (pathname === '/repartidores' || pathname === '/asignacion' || zones.length === 0) return null;

  const activeId = options[activeIndex] ? `${listId}-${options[activeIndex].id}` : undefined;
  const disabled = loading;
  const valueLabel = selectedZoneId === ALL_ZONES_ID ? 'Todas' : selectedZone?.name ?? 'Selecciona una zona';

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <span className={styles.label} id={`${listId}-label`}>
        Cobertura
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
          {valueLabel}
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
          {options.map((option, index) => {
            const selected = option.id === selectedZoneId;
            const active = index === activeIndex;
            return (
              <li key={option.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${option.id}`}
                  tabIndex={-1}
                  role="option"
                  aria-selected={selected}
                  className={`${styles.option} ${active ? styles.optionActive : ''} ${selected ? styles.optionSelected : ''} ${option.id === ALL_ZONES_ID ? styles.optionAll : ''}`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectZone(option.id)}
                >
                  <span className={styles.optionLead}>
                    {option.id === ALL_ZONES_ID ? (
                      <span className={styles.swatchCluster} aria-hidden>
                        {zones.slice(0, 4).map((zone) => (
                          <span
                            key={zone.id}
                            className={styles.swatch}
                            style={{ background: zoneColorForId(zone.id, zoneIds).solid }}
                          />
                        ))}
                      </span>
                    ) : (
                      <span
                        className={styles.swatch}
                        style={{ background: zoneColorForId(option.id, zoneIds).solid }}
                        aria-hidden
                      />
                    )}
                    <span className={styles.optionName}>{option.name}</span>
                  </span>
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
