'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { quoteCart, type CartQuote } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import { cartLinesToQuoteInput } from './cartQuotePayload';
import { cartSubtotalCents } from './cartMath';
import type { PublicMenuCartLine } from './types';

function quoteErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.httpStatus === 404) {
    return 'Algunos productos ya no están disponibles. Actualiza el carrito.';
  }
  return 'No se pudieron aplicar las promociones. Inténtalo de nuevo.';
}

export function useCheckoutCartQuote(
  subdomain: string,
  lines: PublicMenuCartLine[],
  validProductIds: ReadonlySet<string> | null,
) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedSubtotalCents = useMemo(() => cartSubtotalCents(lines), [lines]);

  const allLinesValid = useMemo(() => {
    if (lines.length === 0) return false;
    if (!validProductIds || validProductIds.size === 0) return false;
    return lines.every((line) => validProductIds.has(line.productId));
  }, [lines, validProductIds]);

  const linesKey = useMemo(
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
    setQuote(null);
    setError(null);
    setLoading(false);
  }, [linesKey]);

  const applyPromotions = useCallback(async (): Promise<CartQuote | null> => {
    if (lines.length === 0 || !allLinesValid) return null;

    setLoading(true);
    setError(null);

    try {
      const result = await quoteCart(subdomain, cartLinesToQuoteInput(lines));
      setQuote(result);
      setLoading(false);
      return result;
    } catch (err: unknown) {
      if (!(err instanceof ApiError && err.httpStatus === 404)) {
        console.error(err);
      }
      setQuote(null);
      setError(quoteErrorMessage(err));
      setLoading(false);
      return null;
    }
  }, [allLinesValid, lines, subdomain]);

  const quotedLineTotalsCents = useMemo(() => {
    if (!quote) return null;
    return quote.lines.map((line) => line.line_total_cents);
  }, [quote]);

  const displaySubtotalCents = quote?.total_cents ?? estimatedSubtotalCents;
  const promosApplied = quote != null;

  return {
    estimatedSubtotalCents,
    displaySubtotalCents,
    quote,
    quotedLineTotalsCents,
    promosApplied,
    loading,
    error,
    applyPromotions,
    allLinesValid,
  };
}
