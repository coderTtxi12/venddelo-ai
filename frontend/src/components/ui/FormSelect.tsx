'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import styles from './FormSelect.module.css';

export type FormSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type FormSelectProps = {
  id: string;
  value: string;
  options: FormSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

export function FormSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Selecciona una opción',
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: FormSelectProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const enabledOptions = useMemo(
    () => options.filter((option) => !option.disabled),
    [options],
  );

  const selectedIndex = useMemo(
    () => Math.max(0, enabledOptions.findIndex((option) => option.value === value)),
    [enabledOptions, value],
  );

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? placeholder;

  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, selectedIndex));
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

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const moveActive = (delta: number) => {
    if (enabledOptions.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return enabledOptions.length - 1;
      if (next >= enabledOptions.length) return 0;
      return next;
    });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

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
      setActiveIndex(Math.max(0, enabledOptions.length - 1));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = enabledOptions[activeIndex];
      if (option) selectValue(option.value);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const activeOption = enabledOptions[activeIndex];
  const activeId = activeOption ? `${listId}-${activeOption.value}` : undefined;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        id={id}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`.trim()}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={`${styles.value} ${value ? '' : styles.placeholder}`.trim()}>
          {selectedLabel}
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
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={activeId}
        >
          {options.map((option) => {
            const enabledIndex = enabledOptions.findIndex((row) => row.value === option.value);
            const selected = option.value === value;
            const active = enabledIndex === activeIndex;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${option.value}`}
                  tabIndex={-1}
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={`${styles.option} ${active ? styles.optionActive : ''} ${selected ? styles.optionSelected : ''}`.trim()}
                  onMouseEnter={() => {
                    if (enabledIndex >= 0) setActiveIndex(enabledIndex);
                  }}
                  onClick={() => {
                    if (option.disabled) return;
                    selectValue(option.value);
                  }}
                >
                  <span className={styles.optionCopy}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.description ? (
                      <span className={styles.optionDescription}>{option.description}</span>
                    ) : null}
                  </span>
                  {selected ? <CheckOutlinedIcon sx={{ fontSize: 16 }} aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
