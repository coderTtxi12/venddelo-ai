'use client';

import MyLocationOutlinedIcon from '@mui/icons-material/MyLocationOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeliveryLocationValue } from '@/components/digital-menu/CheckoutDeliveryAddressPicker';
import { ApiError } from '@/lib/api/types';
import {
  fetchPlaceById,
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  loadGoogleMapsEditor,
  loadGoogleMapsPlaces,
  reverseGeocodeCoordinates,
} from '@/lib/loadGoogleMapsPlaces';
import { mapNeedsNewInstance, triggerGoogleMapResize } from '@/lib/maps/googleMapInstance';
import { looksLikeMapsUrl, normalizeMapsUrlInput, parseMapsUrl } from '@/lib/maps/parseMapsUrl';
import styles from './DispatchDeliveryAddressPicker.module.css';

type DispatchDeliveryAddressPickerProps = {
  value: DeliveryLocationValue;
  mapsUrl: string | null;
  onChange: (next: DeliveryLocationValue) => void;
  onMapsUrlChange: (url: string | null) => void;
  resolveMapsUrl: (url: string) => Promise<{ latitude: number; longitude: number }>;
  disabled?: boolean;
  showValidation?: boolean;
};

const DEFAULT_ZOOM = 18;

function readMarkerCoords(
  position: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!position) return null;
  if (typeof (position as google.maps.LatLng).lat === 'function') {
    const latLng = position as google.maps.LatLng;
    return { latitude: latLng.lat(), longitude: latLng.lng() };
  }
  const literal = position as google.maps.LatLngLiteral;
  if (typeof literal.lat !== 'number' || typeof literal.lng !== 'number') return null;
  return { latitude: literal.lat, longitude: literal.lng };
}

export function DispatchDeliveryAddressPicker({
  value,
  mapsUrl,
  onChange,
  onMapsUrlChange,
  resolveMapsUrl,
  disabled = false,
  showValidation = false,
}: DispatchDeliveryAddressPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const dragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const skipDragEmitRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const mapsLinkInFlightRef = useRef<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [autocompleteLoading, setAutocompleteLoading] = useState(true);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [mapBootId, setMapBootId] = useState(0);
  const [geocoding, setGeocoding] = useState(false);
  const [linkResolving, setLinkResolving] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [failedMapsLink, setFailedMapsLink] = useState<string | null>(null);

  onChangeRef.current = onChange;
  valueRef.current = value;

  const hasCoords = value.latitude != null && value.longitude != null;
  const apiKeyMissing = !getGoogleMapsApiKey();

  const disposeMap = useCallback(() => {
    dragEndListenerRef.current?.remove();
    dragEndListenerRef.current = null;
    mapClickListenerRef.current?.remove();
    mapClickListenerRef.current = null;
    if (markerRef.current) {
      markerRef.current.map = null;
    }
    markerRef.current = null;
    mapRef.current = null;
  }, []);

  const showLocationError =
    showValidation &&
    (!value.address.trim() || value.latitude == null || value.longitude == null);

  const handlePlaceSelected = useCallback(
    (place: { address: string; latitude: number; longitude: number; placeId: string | null }) => {
      onMapsUrlChange(null);
      setInputError(null);
      setSearchText(place.address);
      onChangeRef.current({
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.placeId,
      });
    },
    [onMapsUrlChange],
  );

  const applyCoordinates = useCallback(
    async (
      latitude: number,
      longitude: number,
      options?: { mapsUrl?: string | null; address?: string | null },
    ) => {
      onMapsUrlChange(options?.mapsUrl ?? null);
      setInputError(null);

      if (options?.address) {
        setSearchText(options.address);
        onChangeRef.current({
          address: options.address,
          latitude,
          longitude,
          placeId: null,
        });
        return;
      }

      onChangeRef.current({
        ...valueRef.current,
        latitude,
        longitude,
        placeId: null,
      });

      setGeocoding(true);
      try {
        const address = await reverseGeocodeCoordinates(latitude, longitude);
        if (address) {
          setSearchText(address);
          onChangeRef.current({
            address,
            latitude,
            longitude,
            placeId: null,
          });
        }
      } finally {
        setGeocoding(false);
      }
    },
    [onMapsUrlChange],
  );

  const handleMapsLink = useCallback(
    async (rawUrl: string) => {
      const trimmed = normalizeMapsUrlInput(rawUrl);
      if (!trimmed) return;

      if (!looksLikeMapsUrl(trimmed)) {
        setInputError('Pega un enlace válido de Google Maps.');
        return;
      }

      if (mapsLinkInFlightRef.current === trimmed) return;
      mapsLinkInFlightRef.current = trimmed;
      setLinkResolving(true);
      setInputError(null);
      setFailedMapsLink(null);
      setSearchText(trimmed);

      try {
        const local = parseMapsUrl(trimmed);
        const coords = local ?? await resolveMapsUrl(trimmed);
        await applyCoordinates(coords.latitude, coords.longitude, {
          mapsUrl: trimmed,
        });
      } catch (err) {
        setInputError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo leer la ubicación del enlace.',
        );
      } finally {
        setLinkResolving(false);
      }
    },
    [applyCoordinates, resolveMapsUrl],
  );

  const emitMarkerPosition = useCallback(() => {
    if (skipDragEmitRef.current) return;
    const coords = readMarkerCoords(markerRef.current?.position);
    if (!coords) return;

    onMapsUrlChange(null);
    onChangeRef.current({
      ...valueRef.current,
      latitude: coords.latitude,
      longitude: coords.longitude,
      placeId: null,
    });

    setGeocoding(true);
    void reverseGeocodeCoordinates(coords.latitude, coords.longitude)
      .then((address) => {
        if (!address) return;
        setSearchText(address);
        onChangeRef.current({
          ...valueRef.current,
          address,
          latitude: coords.latitude,
          longitude: coords.longitude,
          placeId: null,
        });
      })
      .finally(() => setGeocoding(false));
  }, [onMapsUrlChange]);

  const handleMapPoiClick = useCallback(
    async (event: google.maps.MapMouseEvent) => {
      if (!event.placeId) return;
      event.stop();

      try {
        const place = await fetchPlaceById(event.placeId);
        skipDragEmitRef.current = true;
        if (markerRef.current) {
          markerRef.current.position = { lat: place.latitude, lng: place.longitude };
        }
        mapRef.current?.panTo({ lat: place.latitude, lng: place.longitude });
        skipDragEmitRef.current = false;
        onMapsUrlChange(null);
        setSearchText(place.address);
        onChangeRef.current({
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          placeId: place.placeId,
        });
      } catch (error) {
        console.error(error);
        if (!event.latLng) return;
        emitMarkerPosition();
      }
    },
    [emitMarkerPosition, onMapsUrlChange],
  );

  useEffect(() => {
    if (disabled || apiKeyMissing || !inputRef.current) {
      setAutocompleteLoading(false);
      return;
    }

    let cancelled = false;
    setAutocompleteLoading(true);

    void (async () => {
      try {
        await loadGoogleMapsPlaces();
        if (cancelled || !inputRef.current) return;

        const { Autocomplete } = await google.maps.importLibrary('places');
        const autocomplete = new Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'mx' },
          fields: ['formatted_address', 'geometry', 'place_id'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const latitude = place.geometry?.location?.lat();
          const longitude = place.geometry?.location?.lng();
          const address = place.formatted_address ?? '';
          if (latitude == null || longitude == null || !address) return;
          handlePlaceSelected({
            address,
            latitude,
            longitude,
            placeId: place.place_id ?? null,
          });
        });

        autocompleteRef.current = autocomplete;
        if (!cancelled) setAutocompleteError(null);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAutocompleteError('No se pudo cargar la búsqueda de direcciones.');
        }
      } finally {
        if (!cancelled) setAutocompleteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      autocompleteRef.current = null;
    };
  }, [disabled, apiKeyMissing, handlePlaceSelected]);

  useEffect(() => {
    if (value.latitude == null && value.longitude == null && !value.address.trim()) {
      setSearchText('');
      setInputError(null);
    }
  }, [value.address, value.latitude, value.longitude]);

  useEffect(() => {
    if (!hasCoords || value.latitude == null || value.longitude == null) {
      disposeMap();
      setMapState('idle');
      return;
    }

    if (apiKeyMissing) {
      disposeMap();
      setMapState('error');
      return;
    }

    let cancelled = false;

    void (async () => {
      setMapState('loading');
      try {
        await loadGoogleMapsEditor();
        if (cancelled || !mapContainerRef.current) return;

        const position = { lat: value.latitude!, lng: value.longitude! };
        const container = mapContainerRef.current;

        if (mapNeedsNewInstance(mapRef.current, container)) {
          disposeMap();
          const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
          const { AdvancedMarkerElement } = (await google.maps.importLibrary(
            'marker',
          )) as google.maps.MarkerLibrary;
          if (cancelled || mapContainerRef.current !== container) return;

          mapRef.current = new Map(container, {
            center: position,
            zoom: DEFAULT_ZOOM,
            mapId: getGoogleMapsMapId(),
            gestureHandling: 'greedy',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: true,
          });

          markerRef.current = new AdvancedMarkerElement({
            map: mapRef.current,
            position,
            gmpDraggable: true,
            title: 'Ubicación de entrega',
          });

          dragEndListenerRef.current = markerRef.current.addListener('dragend', emitMarkerPosition);
          mapClickListenerRef.current = mapRef.current.addListener('click', (event) => {
            void handleMapPoiClick(event);
          });
        } else {
          skipDragEmitRef.current = true;
          if (markerRef.current) {
            markerRef.current.position = position;
          }
          mapRef.current?.panTo(position);
          mapRef.current?.setZoom(DEFAULT_ZOOM);
          skipDragEmitRef.current = false;
        }

        if (!cancelled) {
          setMapState('ready');
          const map = mapRef.current;
          if (map) {
            window.requestAnimationFrame(() => {
              if (cancelled) return;
              triggerGoogleMapResize(map);
              map.setCenter(position);
            });
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setMapState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    apiKeyMissing,
    disposeMap,
    emitMarkerPosition,
    handleMapPoiClick,
    hasCoords,
    value.latitude,
    value.longitude,
  ]);

  useEffect(() => {
    return () => {
      disposeMap();
    };
  }, [disposeMap]);

  if (apiKeyMissing) {
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>
          Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para buscar direcciones.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="dispatch-address-search">
        Buscar dirección o pegar enlace
      </label>
      {autocompleteLoading ? <p className={styles.hint}>Cargando búsqueda…</p> : null}
      {autocompleteError ? (
        <p className={styles.error} role="alert">{autocompleteError}</p>
      ) : null}
      {inputError ? <p className={styles.error} role="alert">{inputError}</p> : null}
      <div className={styles.searchShell}>
        <SearchOutlinedIcon className={styles.searchLeadIcon} aria-hidden />
        <input
          ref={inputRef}
          id="dispatch-address-search"
          className={styles.searchInput}
          type="text"
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            if (inputError) setInputError(null);
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text').trim();
            if (!text || !looksLikeMapsUrl(text)) return;
            event.preventDefault();
            void handleMapsLink(text);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && looksLikeMapsUrl(searchText)) {
              event.preventDefault();
              void handleMapsLink(searchText);
            }
          }}
          placeholder="Calle, número, colonia… o https://maps.app.goo.gl/…"
          disabled={disabled || linkResolving}
          autoComplete="off"
        />
      </div>
      <p className={styles.hint}>
        Busca una dirección o pega un enlace de Google Maps para ubicar la entrega.
      </p>

      {linkResolving ? (
        <p className={styles.hint} role="status">Leyendo enlace de Google Maps…</p>
      ) : null}

      {value.address.trim() && !looksLikeMapsUrl(searchText) ? (
        <p className={styles.selectedAddress} aria-live="polite">{value.address}</p>
      ) : null}

      {hasCoords ? (
        <>
          <div className={styles.precisionNote} role="note">
            <MyLocationOutlinedIcon className={styles.precisionIcon} aria-hidden />
            <p className={styles.precisionText}>
              Arrastra el pin hasta la puerta. Cuanto más exacto sea, más rápido llegará el
              repartidor.
            </p>
          </div>

          <div className={styles.mapShell} aria-label="Mapa de entrega">
            {mapState === 'loading' || geocoding || linkResolving ? (
              <p className={styles.mapOverlay}>
                {linkResolving
                  ? 'Leyendo enlace…'
                  : geocoding
                    ? 'Actualizando ubicación…'
                    : 'Cargando mapa…'}
              </p>
            ) : null}
            {mapState === 'error' ? (
              <p className={styles.mapOverlayError}>No se pudo cargar el mapa.</p>
            ) : null}
            <div ref={mapContainerRef} className={styles.mapCanvas} />
          </div>
        </>
      ) : null}

      {showLocationError ? (
        <p className={styles.fieldError} role="alert">
          Indica la ubicación de entrega en el mapa.
        </p>
      ) : null}
    </div>
  );
}
