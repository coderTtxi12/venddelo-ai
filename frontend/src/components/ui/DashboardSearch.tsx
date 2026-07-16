'use client';

import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { ReactNode } from 'react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useDashboardSearchData } from '@/hooks/useDashboardSearchData';
import {
  getDashboardSearchSuggestions,
  groupDashboardSearchResults,
  searchDashboard,
  type DashboardSearchItem,
  type DashboardSearchItemKind,
} from '@/lib/search/dashboardSearch';
import styles from './DashboardSearch.module.css';

function kindIcon(kind: DashboardSearchItemKind, item: DashboardSearchItem): ReactNode {
  if (item.id === 'page:dashboard') return <HomeOutlinedIcon fontSize="small" />;
  if (item.id === 'page:orders' || item.kind === 'order') return <ShoppingBagOutlinedIcon fontSize="small" />;
  if (item.id === 'page:products' || item.kind === 'product') return <Inventory2OutlinedIcon fontSize="small" />;
  if (item.id === 'page:digital-menu') return <QrCode2OutlinedIcon fontSize="small" />;
  if (item.id === 'page:hours' || item.id === 'section:hours') return <AccessTimeOutlinedIcon fontSize="small" />;
  if (item.id === 'page:analytics') return <BarChartOutlinedIcon fontSize="small" />;
  if (item.id === 'page:marketing') return <CampaignOutlinedIcon fontSize="small" />;
  if (item.id === 'page:settings') return <SettingsOutlinedIcon fontSize="small" />;
  if (item.id === 'section:whatsapp') return <WhatsAppIcon fontSize="small" />;
  if (item.id === 'section:payments') return <PaymentsOutlinedIcon fontSize="small" />;
  if (item.id === 'section:location') return <LocationOnOutlinedIcon fontSize="small" />;
  if (item.id === 'section:admins') return <PeopleOutlinedIcon fontSize="small" />;
  if (item.kind === 'category') return <ViewListOutlinedIcon fontSize="small" />;
  if (item.kind === 'action') return <BrainOutlinedIcon sx={{ fontSize: 18 }} />;
  return <SearchOutlinedIcon fontSize="small" />;
}

export default function DashboardSearch() {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { openChat } = useAssistantChat();
  const { orders } = useRestaurantOrders();

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shortcutLabel, setShortcutLabel] = useState('⌘K');

  const trimmedQuery = deferredQuery.trim();
  const shouldLoadCatalog = open && trimmedQuery.length > 0;
  const { products, categories, loading, error } = useDashboardSearchData(shouldLoadCatalog);

  const results = useMemo(
    () =>
      searchDashboard({
        query: deferredQuery,
        products,
        categories,
        orders,
        limit: 14,
      }),
    [categories, deferredQuery, orders, products],
  );

  const groupedResults = useMemo(() => groupDashboardSearchResults(results), [results]);
  const flatResults = useMemo(() => groupedResults.flatMap((group) => group.items), [groupedResults]);
  const suggestions = useMemo(() => getDashboardSearchSuggestions(), []);

  useEffect(() => {
    setShortcutLabel(/Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K');
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, flatResults.length]);

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }

    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function activateItem(item: DashboardSearchItem) {
    setOpen(false);
    setQuery('');

    if (item.action === 'open-assistant') {
      openChat();
      return;
    }

    if (item.href) {
      router.push(item.href);
      const hashIndex = item.href.indexOf('#');
      if (hashIndex >= 0) {
        const hash = item.href.slice(hashIndex + 1);
        window.setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 250);
      }
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % flatResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = flatResults[activeIndex];
      if (selected) activateItem(selected);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open;
  const showEmpty = trimmedQuery.length > 0 && !loading && flatResults.length === 0;
  const activeItemId =
    flatResults[activeIndex] != null ? `${listboxId}-option-${flatResults[activeIndex].id}` : undefined;

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={`${styles.searchBox} ${showDropdown ? styles.searchBoxOpen : ''}`}>
        <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={showDropdown ? activeItemId : undefined}
          aria-autocomplete="list"
          aria-label="Buscar en el dashboard"
          placeholder="Buscar páginas, productos, órdenes..."
          className={styles.searchInput}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        <span className={styles.shortcutHint} aria-hidden>
          {shortcutLabel}
        </span>
      </div>

      {showDropdown ? (
        <div className={styles.dropdown}>
          <div className={styles.dropdownInner}>
            {trimmedQuery.length === 0 ? (
              <>
                <div className={styles.statusRow}>Escribe para buscar cualquier sección del panel.</div>
                <div className={styles.suggestions}>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className={styles.suggestionChip}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQuery(suggestion);
                        setOpen(true);
                        inputRef.current?.focus();
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {loading ? <div className={styles.statusRow}>Buscando productos y categorías…</div> : null}
            {error ? <div className={styles.statusRow}>{error}</div> : null}

            {showEmpty ? (
              <div className={styles.emptyState}>
                <strong>Sin resultados</strong>
                Prueba con otro término, como &quot;analiticas&quot;, &quot;whatsapp&quot; o el nombre de un producto.
              </div>
            ) : null}

            {flatResults.length > 0 ? (
              <div id={listboxId} role="listbox" aria-label="Resultados de búsqueda">
                {groupedResults.map((group) => (
                  <section key={group.id} className={styles.group} aria-label={group.label}>
                    <div className={styles.groupLabel}>{group.label}</div>
                    <ul className={styles.resultList}>
                      {group.items.map((item) => {
                        const flatIndex = flatResults.findIndex((candidate) => candidate.id === item.id);
                        const isActive = flatIndex === activeIndex;
                        return (
                          <li key={item.id} role="presentation">
                            <button
                              type="button"
                              id={`${listboxId}-option-${item.id}`}
                              role="option"
                              aria-selected={isActive}
                              className={`${styles.resultItem} ${isActive ? styles.resultItemActive : ''}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => activateItem(item)}
                            >
                              <span className={styles.resultIcon} aria-hidden>
                                {kindIcon(item.kind, item)}
                              </span>
                              <span className={styles.resultBody}>
                                <span className={styles.resultTitle}>{item.title}</span>
                                {item.subtitle ? (
                                  <span className={styles.resultSubtitle}>{item.subtitle}</span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
