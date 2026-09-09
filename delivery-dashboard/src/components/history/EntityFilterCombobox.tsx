'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  filterEntityOptions,
  historyEntityModeLabel,
  selectedEntityOptions,
  toggleEntityId,
  type HistoryEntityMode,
  type HistoryEntityOption,
} from '@/lib/dispatch/historyFilters';
import styles from './EntityFilterCombobox.module.css';

const ALL_ID = '';

type EntityFilterComboboxProps = {
  id: string;
  labelledBy: string;
  options: HistoryEntityOption[];
  selectedIds: string[];
  mode: HistoryEntityMode;
  placeholder: string;
  allLabel?: string;
  onChange: (next: { ids: string[]; mode: HistoryEntityMode }) => void;
};

function highlightIndex(query: string, matchCount: number): number {
  return query.trim() && matchCount > 0 ? 1 : 0;
}

export function EntityFilterCombobox({
  id,
  labelledBy,
  options,
  selectedIds,
  mode,
  placeholder,
  allLabel = 'Todos',
  onChange,
}: EntityFilterComboboxProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = selectedEntityOptions(options, selectedIds);
  const matches = useMemo(() => filterEntityOptions(options, query), [options, query]);
  const items = useMemo(
    () => [{ id: ALL_ID, label: allLabel }, ...matches],
    [allLabel, matches],
  );
  const highlighted = Math.min(activeIndex, Math.max(0, items.length - 1));

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  const emit = (ids: string[], nextMode: HistoryEntityMode = mode) => {
    onChange({
      ids,
      mode: ids.length ? nextMode : 'include',
    });
  };

  const selectItem = (idValue: string) => {
    if (!idValue) {
      emit([]);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    emit(toggleEntityId(selectedIds, idValue));
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const moveActive = (delta: number) => {
    if (items.length === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !query && selectedIds.length > 0) {
      event.preventDefault();
      emit(selectedIds.slice(0, -1));
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[highlighted];
      if (item) selectItem(item.id);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const activeItem = items[highlighted];
  const activeOptionId = activeItem ? `${listId}-${activeItem.id || 'all'}` : undefined;
  const statusText =
    selected.length === 0
      ? 'Sin filtro'
      : `${selected.length} ${selected.length === 1 ? 'seleccionado' : 'seleccionados'}`;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <span className={styles.status} role="status" aria-atomic="true">
        {statusText}
      </span>
      <div className={styles.fieldWrap}>
      <div className={`${styles.field} ${open ? styles.fieldOpen : ''}`.trim()}>
        <SearchOutlinedIcon className={styles.searchIcon} sx={{ fontSize: 18 }} aria-hidden />
        <div className={styles.chipList}>
          {selected.map((option) => (
            <span key={option.id} className={styles.chip}>
              <span className={styles.chipLabel} title={option.label}>
                {option.label}
              </span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Quitar ${option.label}`}
                onClick={() => emit(selectedIds.filter((idValue) => idValue !== option.id))}
              >
                <CloseOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            inputMode="search"
            autoCapitalize="none"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-labelledby={labelledBy}
            aria-activedescendant={open ? activeOptionId : undefined}
            className={styles.input}
            placeholder={selected.length ? 'Agregar otro' : placeholder}
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setOpen(true);
              setActiveIndex(
                highlightIndex(nextQuery, filterEntityOptions(options, nextQuery).length),
              );
            }}
            onFocus={() => {
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {selectedIds.length > 0 ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Quitar todos"
            onClick={() => selectItem(ALL_ID)}
          >
            <CloseOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <ul
          id={listId}
          className={styles.menu}
          role="listbox"
          aria-labelledby={labelledBy}
          aria-multiselectable="true"
        >
          {query.trim() && matches.length === 0 ? (
            <li className={styles.empty} role="presentation">
              No hay coincidencias. Prueba otro nombre.
            </li>
          ) : null}
          {items.map((item, index) => {
            const selectedOption =
              item.id === ALL_ID ? selectedIds.length === 0 : selectedIds.includes(item.id);
            return (
              <li key={item.id || 'all'} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${item.id || 'all'}`}
                  tabIndex={-1}
                  role="option"
                  aria-selected={selectedOption}
                  className={`${styles.option} ${index === highlighted ? styles.optionActive : ''} ${
                    selectedOption ? styles.optionSelected : ''
                  }`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(item.id)}
                >
                  <span className={styles.optionLabel}>{item.label}</span>
                  {selectedOption ? <CheckOutlinedIcon sx={{ fontSize: 16 }} aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      </div>

      {selectedIds.length > 0 ? (
        <div className={styles.mode} role="group" aria-label="Modo del filtro">
          <button
            type="button"
            className={styles.modeButton}
            aria-pressed={mode === 'include'}
            onClick={() => emit(selectedIds, 'include')}
          >
            {historyEntityModeLabel('include', selectedIds.length)}
          </button>
          <button
            type="button"
            className={styles.modeButton}
            aria-pressed={mode === 'exclude'}
            onClick={() => emit(selectedIds, 'exclude')}
          >
            {historyEntityModeLabel('exclude', selectedIds.length)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
