/**
 * Carga el script de Google Maps JS API con la librería `places` (una sola vez).
 * Requiere `VITE_GOOGLE_MAPS_API_KEY` en `.env`.
 */
let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsPlaces(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-places="1"]'
    );
    if (existing) {
      if (window.google?.maps?.places) {
        queueMicrotask(() => resolve());
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps script error')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.dataset.googleMapsPlaces = '1';
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function isGoogleMapsLoaded(): boolean {
  return Boolean(typeof window !== 'undefined' && window.google?.maps?.places);
}
