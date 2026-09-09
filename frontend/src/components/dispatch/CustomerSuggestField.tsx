'use client';

import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { RestaurantCustomer } from '@/lib/api/customers';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { reduceSuggestMenu } from '@/lib/customers/suggestMenu';
import {
  MIN_QUERY_CHARS,
  useCustomerSuggestions,
} from '@/lib/customers/useCustomerSuggestions';
import styles from './CustomerSuggestField.module.css';

type CustomerSuggestFieldProps = {
  accessToken: string;
  restaurantId: string;
  query: string;
  enabled: boolean;
  onSelect: (customer: RestaurantCustomer) => void | Promise<void>;
  children: (args: {
    listboxId: string;
    expanded: boolean;
    activeOptionId: string | undefined;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onFocus: () => void;
    onQueryInput: () => void;
  }) => ReactNode;
};

export function CustomerSuggestField({
  accessToken,
  restaurantId,
  query,
  enabled,
  onSelect,
  children,
}: CustomerSuggestFieldProps) {
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menu, dispatchMenu] = useReducer(reduceSuggestMenu, { open: false });
  const open = menu.open;
  const [activeIndex, setActiveIndex] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const { items, loading } = useCustomerSuggestions({
    accessToken,
    restaurantId,
    query,
    enabled: enabled && open,
  });

  const showList =
    open &&
    enabled &&
    query.trim().length >= MIN_QUERY_CHARS &&
    (loading || items.length > 0 || selecting);

  useEffect(() => {
    setActiveIndex(0);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        dispatchMenu({ type: 'dismiss' });
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') dispatchMenu({ type: 'dismiss' });
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function pick(customer: RestaurantCustomer) {
    setSelecting(true);
    try {
      await onSelect(customer);
      dispatchMenu({ type: 'select' });
    } finally {
      setSelecting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!showList || items.length === 0) {
      if (event.key === 'ArrowDown' && query.trim().length >= MIN_QUERY_CHARS) {
        dispatchMenu({ type: 'focus' });
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
      return;
    }
    if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault();
      void pick(items[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatchMenu({ type: 'dismiss' });
    }
  }

  const activeOptionId =
    showList && items[activeIndex] != null
      ? `${listboxId}-option-${items[activeIndex].phone_key}`
      : undefined;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {children({
        listboxId,
        expanded: Boolean(showList),
        activeOptionId,
        onKeyDown,
        onFocus: () => dispatchMenu({ type: 'focus' }),
        onQueryInput: () => dispatchMenu({ type: 'user-edit' }),
      })}

      {showList ? (
        <div
          id={listboxId}
          className={styles.list}
          role="listbox"
          aria-label="Clientes sugeridos"
        >
          {loading && items.length === 0 ? (
            <p className={styles.status} role="status">
              Buscando…
            </p>
          ) : null}
          {selecting ? (
            <p className={styles.status} role="status">
              Cargando cliente…
            </p>
          ) : null}
          {items.map((customer, index) => {
            const optionId = `${listboxId}-option-${customer.phone_key}`;
            const active = index === activeIndex;
            return (
              <button
                key={customer.phone_key}
                id={optionId}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void pick(customer)}
              >
                <span className={styles.optionName}>
                  {customer.customer_name.trim() || 'Sin nombre'}
                </span>
                <span className={styles.optionPhone}>
                  {formatOrderCustomerPhone(customer.customer_phone)}
                </span>
                <span className={styles.optionMeta}>
                  {customer.visit_count === 1
                    ? '1 pedido'
                    : `${customer.visit_count} pedidos`}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
