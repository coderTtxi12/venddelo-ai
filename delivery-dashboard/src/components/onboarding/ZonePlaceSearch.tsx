'use client';

import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMapsPlaces } from '@/lib/loadGoogleMaps';
import styles from './ZonePlaceSearch.module.css';

type ZonePlaceSearchProps = {
  onPlaceSelected: (place: {
    address: string;
    latitude: number;
    longitude: number;
    placeId: string | null;
  }) => void;
  disabled?: boolean;
};

export function ZonePlaceSearch({ onPlaceSelected, disabled = false }: ZonePlaceSearchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (disabled) return;

    let cancelled = false;
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      setLoadError('Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para buscar zonas.');
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        await loadGoogleMapsPlaces();
        if (cancelled || !hostRef.current) return;

        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
        const autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ['mx'],
        });
        autocomplete.className = styles.autocompleteHost;

        autocomplete.addEventListener('gmp-select', (event: google.maps.places.PlacePredictionSelectEvent) => {
          void (async () => {
            try {
              const place = event.placePrediction.toPlace();
              await place.fetchFields({
                fields: ['formattedAddress', 'location', 'id'],
              });
              const address = place.formattedAddress ?? '';
              const latitude = place.location?.lat();
              const longitude = place.location?.lng();
              if (!address || latitude == null || longitude == null) return;
              onPlaceSelected({
                address,
                latitude,
                longitude,
                placeId: place.id ?? null,
              });
            } catch (error) {
              console.error(error);
            }
          })();
        });

        hostRef.current.replaceChildren(autocomplete as unknown as Node);
        setLoadError(null);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError('No se pudo cargar Google Places. Revisa tu API key.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [disabled, onPlaceSelected]);

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="zone-place-autocomplete">
        <SearchOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
        Buscar ciudad, colonia o zona
      </label>
      {loading ? <p className={styles.hint}>Cargando búsqueda…</p> : null}
      {loadError ? (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      ) : null}
      <div ref={hostRef} id="zone-place-autocomplete" className={styles.host} />
      <p className={styles.hint}>
        Primero ubica tu zona en el mapa; después dibuja el cerco de entregas.
      </p>
    </div>
  );
}
