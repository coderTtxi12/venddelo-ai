'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OptionSelections } from '@/components/digital-menu/productOptionSelection';
import { quoteCart, type CartQuote } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import type { PublicMenuCartLine } from './types';
import { cartSubtotalCents } from './cartMath';

function selectionsToApi(selections: OptionSelections): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [groupId, itemIds] of Object.entries(selections)) {
    if (itemIds.length > 0) {
      out[groupId] = itemIds;
    }
  }
  return out;
}

export function useCartQuote(
  subdomain: string,
  lines: PublicMenuCartLine[],
  validProductIds: ReadonlySet<string> | null,
) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackSubtotalCents = useMemo(() => cartSubtotalCents(lines), [lines]);

  const allLinesValid = useMemo(() => {
    if (lines.length === 0) return true;
    if (!validProductIds || validProductIds.size === 0) return false;
    return lines.every((line) => validProductIds.has(line.productId));
  }, [lines, validProductIds]);

  const payloadKey = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          selections: line.selections,
        })),
      ),
    [lines],
  );

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!allLinesValid) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void quoteCart(subdomain, {
      items: lines.map((line) => ({
        product_id: line.productId,
        quantity: line.quantity,
        selected_options: selectionsToApi(line.selections),
      })),
    })
      .then((result) => {
        if (!cancelled) {
          setQuote(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (!(err instanceof ApiError && err.httpStatus === 404)) {
            console.error(err);
          }
          setQuote(null);
          setError(
            err instanceof ApiError && err.httpStatus === 404
              ? 'Algunos productos ya no están disponibles. Actualiza el carrito.'
              : 'No se pudo calcular el total con promociones.',
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [subdomain, payloadKey, allLinesValid, lines]);

  const subtotalCents = quote?.total_cents ?? fallbackSubtotalCents;

  const quotedLineTotalsCents = useMemo(() => {
    if (!quote) return null;
    return quote.lines.map((line) => line.line_total_cents);
  }, [quote]);

  return {
    quote,
    subtotalCents,
    quotedLineTotalsCents,
    loading,
    error,
  };
}
