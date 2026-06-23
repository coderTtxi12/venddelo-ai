'use client';

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import type { Category, Product, Promotion } from '@/lib/api/types';
import {
  ProductListThumb,
  ProductPrice,
  isProductAvailable,
} from '@/components/digital-menu/menuProductUi';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';
import type { PromotionCountdownContext } from '@/lib/promotions/promotionCountdown';
import {
  getMenuSearchSuggestions,
  searchMenu,
  type MenuSearchHit,
} from '@/lib/digital-menu/search/menuSearch';
import styles from './PublicMenuSearch.module.css';

type PublicMenuSearchProps = {
  open: boolean;
  onClose: () => void;
  products: Product[];
  categories: Category[];
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  productTimeLimitedPromotions: Map<string, Promotion>;
  promotionTimezone: string;
  countdownContext: PromotionCountdownContext;
  onProductSelect: (productId: string) => void;
  onCategorySelect: (categoryId: string) => void;
  themeStyle?: CSSProperties;
};

function ResultRow({
  hit,
  productDiscounts,
  productTimeLimitedPromotions,
  promotionTimezone,
  countdownContext,
  onSelect,
}: {
  hit: MenuSearchHit;
  productDiscounts: Map<string, MenuProductDiscountInfo>;
  productTimeLimitedPromotions: Map<string, Promotion>;
  promotionTimezone: string;
  countdownContext: PromotionCountdownContext;
  onSelect: (hit: MenuSearchHit) => void;
}) {
  const product = hit.product;
  const unavailable = product != null && !isProductAvailable(product);

  return (
    <li>
      <button
        type="button"
        className={`${styles.resultItem} ${unavailable ? styles.resultItemUnavailable : ''}`}
        onClick={() => onSelect(hit)}
      >
        {hit.kind === 'product' && product ? (
          <ProductListThumb product={product} className={styles.resultThumb} />
        ) : (
          <span className={styles.categoryThumb} aria-hidden>
            <ViewListOutlinedIcon fontSize="small" />
          </span>
        )}

        <div className={styles.resultBody}>
          <div className={styles.resultTitleRow}>
            <span className={styles.resultTitle}>{hit.title}</span>
          </div>
          {hit.subtitle ? <span className={styles.resultSubtitle}>{hit.subtitle}</span> : null}
          {hit.matchLabels.length > 0 ? (
            <div className={styles.matchBadges}>
              {hit.matchLabels.map((label) => (
                <span key={label} className={styles.matchBadge}>
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {hit.kind === 'product' && product ? (
          <div className={styles.resultPrice}>
            <ProductPrice
              product={product}
              discount={productDiscounts.get(product.id)}
              timeLimitedPromotion={productTimeLimitedPromotions.get(product.id)}
              promotionTimezone={promotionTimezone}
              countdownContext={countdownContext}
            />
          </div>
        ) : null}
      </button>
    </li>
  );
}

export function PublicMenuSearch({
  open,
  onClose,
  products,
  categories,
  productDiscounts,
  productTimeLimitedPromotions,
  promotionTimezone,
  countdownContext,
  onProductSelect,
  onCategorySelect,
  themeStyle,
}: PublicMenuSearchProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const results = useMemo(
    () =>
      searchMenu({
        query: deferredQuery,
        products,
        categories,
      }),
    [deferredQuery, products, categories],
  );

  const suggestions = useMemo(() => getMenuSearchSuggestions(categories), [categories]);
  const trimmedQuery = deferredQuery.trim();
  const showSuggestions = trimmedQuery.length === 0;
  const showNoResults = trimmedQuery.length > 0 && results.length === 0;

  const handleSelect = (hit: MenuSearchHit) => {
    onClose();
    if (hit.kind === 'product' && hit.product) {
      onProductSelect(hit.product.id);
      return;
    }
    if (hit.kind === 'category' && hit.category) {
      onCategorySelect(hit.category.id);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={styles.overlay}
      style={themeStyle}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.searchHeader}>
          <label className={styles.searchFieldWrap} htmlFor={`${titleId}-input`}>
            <SearchOutlinedIcon fontSize="small" className={styles.searchIcon} aria-hidden />
            <input
              ref={inputRef}
              id={`${titleId}-input`}
              type="search"
              className={styles.searchInput}
              placeholder="Buscar productos, categorías, complementos..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
          <span className={styles.keyboardHint} aria-hidden>
            Esc para cerrar
          </span>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Cerrar búsqueda"
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className={styles.body}>
          <h2 id={titleId} className={styles.visuallyHidden}>
            Buscar en el menú
          </h2>

          {showSuggestions ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>¿Qué te gustaría pedir?</p>
              <p className={styles.emptyHint}>
                Busca por nombre de producto, descripción, complemento o categoría.
              </p>
              {suggestions.length > 0 ? (
                <div className={styles.suggestions} aria-label="Sugerencias de búsqueda">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className={styles.suggestionChip}
                      onClick={() => setQuery(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {showNoResults ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Sin resultados para “{trimmedQuery}”</p>
              <p className={styles.emptyHint}>
                Prueba con otro término o explora las categorías del menú.
              </p>
              {suggestions.length > 0 ? (
                <div className={styles.suggestions} aria-label="Sugerencias alternativas">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className={styles.suggestionChip}
                      onClick={() => setQuery(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!showSuggestions && !showNoResults ? (
            <>
              <p className={styles.resultsMeta}>
                {results.length} resultado{results.length === 1 ? '' : 's'}
              </p>
              <ul className={styles.resultList}>
                {results.map((hit) => (
                  <ResultRow
                    key={hit.id}
                    hit={hit}
                    productDiscounts={productDiscounts}
                    productTimeLimitedPromotions={productTimeLimitedPromotions}
                    promotionTimezone={promotionTimezone}
                    countdownContext={countdownContext}
                    onSelect={handleSelect}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
