import { useEffect, useState } from 'react';
import { quotePublicDelivery, type PublicDeliveryQuote } from '@/lib/api/public';

type UsePublicDeliveryQuoteArgs = {
  subdomain: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
};

export function usePublicDeliveryQuote({
  subdomain,
  enabled,
  latitude,
  longitude,
}: UsePublicDeliveryQuoteArgs) {
  const [quote, setQuote] = useState<PublicDeliveryQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || latitude == null || longitude == null) {
      setQuote(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);

      void quotePublicDelivery(subdomain, { latitude, longitude })
        .then((result) => {
          if (cancelled) return;
          setQuote(result);
          if (!result.available) {
            setError(result.reason ?? 'Entrega no disponible para esta dirección.');
          }
        })
        .catch(() => {
          if (cancelled) return;
          setQuote(null);
          setError('No se pudo validar la cobertura de entrega.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, latitude, longitude, subdomain]);

  return { quote, loading, error };
}
