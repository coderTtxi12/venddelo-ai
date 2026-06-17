let loadPromise: Promise<void> | null = null;

export function getGoogleMapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

/** Map ID required for Advanced Markers. Use DEMO_MAP_ID for local dev. */
export function getGoogleMapsMapId(): string {
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim();
  return mapId || 'DEMO_MAP_ID';
}

async function ensureGoogleMapsScript(): Promise<void> {
  if (typeof window === 'undefined') return;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en el entorno.');
  }

  if (window.google?.maps?.importLibrary) return;

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(undefined), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google Maps script error')), {
          once: true,
        });
        return;
      }

      const callbackName = '__venddeloGoogleMapsInit';
      (window as unknown as Record<string, () => void>)[callbackName] = () => resolve(undefined);

      const script = document.createElement('script');
      script.dataset.googleMaps = '1';
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places&callback=${callbackName}`;
      script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
      document.head.appendChild(script);
    });
  }

  await loadPromise;
}

export async function loadGoogleMapsPlaces(): Promise<void> {
  await ensureGoogleMapsScript();
  await window.google!.maps.importLibrary('places');
}

export async function loadGoogleMapsEditor(): Promise<void> {
  await ensureGoogleMapsScript();
  await Promise.all([
    window.google!.maps.importLibrary('maps'),
    window.google!.maps.importLibrary('marker'),
  ]);
}

export type SelectedPlace = {
  address: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
};

export async function readSelectedPlace(place: google.maps.places.Place): Promise<SelectedPlace> {
  await place.fetchFields({
    fields: ['formattedAddress', 'location', 'id'],
  });

  const address = place.formattedAddress ?? '';
  const latitude = place.location?.lat() ?? 0;
  const longitude = place.location?.lng() ?? 0;
  const placeId = place.id ?? null;

  if (!address || latitude === 0 && longitude === 0) {
    throw new Error('No se pudo leer la ubicación seleccionada.');
  }

  return { address, latitude, longitude, placeId };
}
