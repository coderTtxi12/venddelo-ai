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
import {
  extractMapsQueryText,
  looksLikeCoordinates,
  looksLikeMapsUrl,
  normalizeMapsUrlInput,
  parseMapsUrl,
  parsePastedCoordinates,
} from '@/lib/maps/parseMapsUrl';
import styles from './DispatchDeliveryAddressPicker.module.css';

type DispatchDeliveryAddressPickerProps = {
  value: DeliveryLocationValue;
  mapsUrl: string | null;
  onChange: (next: DeliveryLocationValue) => void;
  onMapsUrlChange: (url: string | null) => void;
  resolveMapsUrl: (url: string) => Promise<{
    latitude: number;
    longitude: number;
    address?: string | null;
  }>;
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

  const handlePastedLocation = useCallback(
    async (rawUrl: string) => {
      const coords = parsePastedCoordinates(rawUrl);
      if (coords) {
        if (mapsLinkInFlightRef.current === rawUrl.trim()) return;
        mapsLinkInFlightRef.current = rawUrl.trim();
        setLinkResolving(true);
        setInputError(null);
        setFailedMapsLink(null);
        try {
          await applyCoordinates(coords.latitude, coords.longitude, { mapsUrl: null });
          setMapBootId((current) => current + 1);
        } catch {
          setInputError('No se pudieron leer esas coordenadas.');
        } finally {
          mapsLinkInFlightRef.current = null;
          setLinkResolving(false);
        }
        return;
      }

      const trimmed = normalizeMapsUrlInput(rawUrl);
      if (!trimmed) return;

      if (!looksLikeMapsUrl(trimmed)) {
        setInputError('Pega un enlace de Google Maps o coordenadas (lat, lng).');
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
        if (local) {
          await applyCoordinates(local.latitude, local.longitude, {
            mapsUrl: trimmed,
            address: extractMapsQueryText(trimmed),
          });
        } else {
          const resolved = await resolveMapsUrl(trimmed);
          await applyCoordinates(resolved.latitude, resolved.longitude, {
            mapsUrl: trimmed,
            address: resolved.address ?? extractMapsQueryText(trimmed),
          });
        }
        setMapBootId((current) => current + 1);
      } catch (err) {
        setFailedMapsLink(trimmed);
        setInputError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo leer la ubicación del enlace.',
        );
      } finally {
        mapsLinkInFlightRef.current = null;
        setLinkResolving(false);
      }
    },
    [applyCoordinates, resolveMapsUrl],
  );

  const retryMapsLink = useCallback(() => {
    const target = failedMapsLink || searchText;
    if (!looksLikeMapsUrl(target) && !looksLikeCoordinates(target)) return;
    void handlePastedLocation(target);
  }, [failedMapsLink, handlePastedLocation, searchText]);

  const retryMap = useCallback(() => {
    disposeMap();
    setMapState('loading');
    setMapBootId((current) => current + 1);
  }, [disposeMap]);

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
      setFailedMapsLink(null);
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
        if (cancelled) return;

        let container = mapContainerRef.current;
        for (let attempt = 0; attempt < 8 && !container && !cancelled; attempt += 1) {
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
          });
          container = mapContainerRef.current;
        }
        if (cancelled) return;
        if (!container) {
          setMapState('error');
          return;
        }

        const position = { lat: value.latitude!, lng: value.longitude! };

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
    mapBootId,
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

  const canUsePastedLocation =
    looksLikeMapsUrl(searchText) || looksLikeCoordinates(searchText) || Boolean(failedMapsLink);
  const showMapBusy =
    mapState !== 'error' && (mapState === 'loading' || geocoding || linkResolving);

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="dispatch-address-search">
        Buscar dirección, enlace o coordenadas
      </label>
      {autocompleteLoading ? <p className={styles.hint}>Cargando búsqueda…</p> : null}
      {autocompleteError ? (
        <p className={styles.error} role="alert">{autocompleteError}</p>
      ) : null}
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
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text').trim();
            if (!text || (!looksLikeMapsUrl(text) && !looksLikeCoordinates(text))) return;
            event.preventDefault();
            setSearchText(text);
            void handlePastedLocation(text);
          }}
          onBlur={() => {
            if (disabled || linkResolving) return;
            if (looksLikeCoordinates(searchText)) {
              void handlePastedLocation(searchText);
              return;
            }
            if (!looksLikeMapsUrl(searchText)) return;
            if (mapsUrl === normalizeMapsUrlInput(searchText) && hasCoords) return;
            void handlePastedLocation(searchText);
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (looksLikeMapsUrl(searchText) || looksLikeCoordinates(searchText))
            ) {
              event.preventDefault();
              void handlePastedLocation(searchText);
            }
          }}
          placeholder="Calle, colonia, maps.app.goo.gl o 19.62, -99.10"
          disabled={disabled || linkResolving}
          autoComplete="off"
        />
        {looksLikeMapsUrl(searchText) || looksLikeCoordinates(searchText) ? (
          <button
            type="button"
            className={styles.useLinkButton}
            onClick={() => void handlePastedLocation(searchText)}
            disabled={disabled || linkResolving}
          >
            {linkResolving ? 'Leyendo…' : looksLikeCoordinates(searchText) ? 'Usar coordenadas' : 'Usar enlace'}
          </button>
        ) : null}
      </div>
      {inputError ? (
        <div className={styles.errorRow} role="alert">
          <p className={styles.error}>{inputError}</p>
          {canUsePastedLocation ? (
            <button
              type="button"
              className={styles.retryButton}
              onClick={retryMapsLink}
              disabled={disabled || linkResolving}
            >
              <RefreshOutlinedIcon className={styles.retryIcon} aria-hidden />
              Reintentar enlace
            </button>
          ) : null}
        </div>
      ) : null}
      <p className={styles.hint}>
        Pega un enlace de Google Maps o coordenadas (lat, lng). Si el mapa no aparece,
        reintenta; también puedes buscar la dirección por nombre.
      </p>

      {linkResolving ? (
        <p className={styles.hint} role="status">Leyendo enlace de Google Maps…</p>
      ) : null}

      {value.address.trim() && !looksLikeMapsUrl(searchText) && !looksLikeCoordinates(searchText) ? (
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
            {showMapBusy ? (
              <p className={styles.mapOverlay}>
                {linkResolving
                  ? 'Leyendo enlace…'
                  : geocoding
                    ? 'Actualizando ubicación…'
                    : 'Cargando mapa…'}
              </p>
            ) : null}
            {mapState === 'error' ? (
              <div className={styles.mapOverlayError}>
                <p className={styles.mapErrorText}>No se pudo cargar el mapa.</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={retryMap}
                  disabled={disabled}
                >
                  <RefreshOutlinedIcon className={styles.retryIcon} aria-hidden />
                  Reintentar mapa
                </button>
              </div>
            ) : null}
            <div
              key={mapBootId}
              ref={mapContainerRef}
              className={styles.mapCanvas}
            />
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
