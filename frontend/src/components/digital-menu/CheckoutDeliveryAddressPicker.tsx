'use client';

import MyLocationOutlinedIcon from '@mui/icons-material/MyLocationOutlined';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPlaceById,
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  loadGoogleMapsEditor,
  loadGoogleMapsPlaces,
  reverseGeocodeCoordinates,
} from '@/lib/loadGoogleMapsPlaces';
import { dismissMobileKeyboard, scrollElementIntoViewAfterKeyboard } from '@/lib/mobileKeyboard';
import styles from './CheckoutDeliveryAddressPicker.module.css';

export type DeliveryLocationValue = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

type CheckoutDeliveryAddressPickerProps = {
  value: DeliveryLocationValue;
  onChange: (next: DeliveryLocationValue) => void;
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

export function CheckoutDeliveryAddressPicker({
  value,
  onChange,
  showValidation = false,
}: CheckoutDeliveryAddressPickerProps) {
  const autocompleteHostRef = useRef<HTMLDivElement>(null);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const shouldScrollToMapRef = useRef(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const dragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const skipDragEmitRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  const [autocompleteLoading, setAutocompleteLoading] = useState(true);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [geocoding, setGeocoding] = useState(false);

  onChangeRef.current = onChange;
  valueRef.current = value;

  const hasCoords = value.latitude != null && value.longitude != null;
  const apiKeyMissing = !getGoogleMapsApiKey();

  const showLocationError =
    showValidation &&
    (!value.address.trim() || value.latitude == null || value.longitude == null);

  const handlePlaceSelected = useCallback(
    (place: { address: string; latitude: number; longitude: number; placeId: string | null }) => {
      shouldScrollToMapRef.current = true;
      dismissMobileKeyboard(autocompleteHostRef.current);
      onChangeRef.current({
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.placeId,
      });
    },
    [],
  );

  const emitMarkerPosition = useCallback(() => {
    if (skipDragEmitRef.current) return;
    const coords = readMarkerCoords(markerRef.current?.position);
    if (!coords) return;

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
        onChangeRef.current({
          ...valueRef.current,
          address,
          latitude: coords.latitude,
          longitude: coords.longitude,
          placeId: null,
        });
      })
      .finally(() => setGeocoding(false));
  }, []);

  const handleMapPoiClick = useCallback(async (event: google.maps.MapMouseEvent) => {
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
      onChangeRef.current({
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.placeId,
      });
    } catch (error) {
      console.error(error);
      const latLng = event.latLng;
      if (!latLng) return;
      emitMarkerPosition();
    }
  }, [emitMarkerPosition]);

  useEffect(() => {
    if (apiKeyMissing) {
      setAutocompleteLoading(false);
      setAutocompleteError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleMapsPlaces();
        if (cancelled || !autocompleteHostRef.current) return;

        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
        const autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ['mx'],
        });
        autocomplete.className = styles.autocompleteHost;

        autocomplete.addEventListener(
          'gmp-select',
          (event: google.maps.places.PlacePredictionSelectEvent) => {
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
                handlePlaceSelected({
                  address,
                  latitude,
                  longitude,
                  placeId: place.id ?? null,
                });
              } catch (error) {
                console.error(error);
              }
            })();
          },
        );

        autocompleteHostRef.current.replaceChildren(autocomplete as unknown as Node);
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
    };
  }, [apiKeyMissing, handlePlaceSelected]);

  useEffect(() => {
    if (!hasCoords || !shouldScrollToMapRef.current) return;

    shouldScrollToMapRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      scrollElementIntoViewAfterKeyboard(mapShellRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasCoords, value.latitude, value.longitude]);

  useEffect(() => {
    if (!hasCoords || value.latitude == null || value.longitude == null) {
      setMapState('idle');
      return;
    }

    if (apiKeyMissing) {
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

        if (!mapRef.current) {
          const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
          const { AdvancedMarkerElement } = (await google.maps.importLibrary(
            'marker',
          )) as google.maps.MarkerLibrary;

          mapRef.current = new Map(mapContainerRef.current, {
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
          mapRef.current.panTo(position);
          mapRef.current.setZoom(DEFAULT_ZOOM);
          skipDragEmitRef.current = false;
        }

        if (!cancelled) setMapState('ready');
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
    emitMarkerPosition,
    handleMapPoiClick,
    hasCoords,
    value.latitude,
    value.longitude,
  ]);

  useEffect(() => {
    return () => {
      dragEndListenerRef.current?.remove();
      dragEndListenerRef.current = null;
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
      if (markerRef.current) {
        markerRef.current.map = null;
      }
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  if (apiKeyMissing) {
    return (
      <div className={styles.wrap}>
        <label className={styles.label} htmlFor="checkout-delivery-address-fallback">
          Dirección de entrega
        </label>
        <textarea
          id="checkout-delivery-address-fallback"
          className={styles.fallbackTextArea}
          value={value.address}
          onChange={(event) =>
            onChange({
              ...value,
              address: event.target.value,
              latitude: null,
              longitude: null,
              placeId: null,
            })
          }
          placeholder="Calle, número, colonia, referencias"
          autoComplete="street-address"
          aria-invalid={showLocationError}
        />
        {showLocationError ? (
          <p className={styles.fieldError} role="alert">
            Escribe una dirección completa para la entrega.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="checkout-delivery-address-search">
        Busca tu domicilio
      </label>
      {autocompleteLoading ? <p className={styles.hint}>Cargando búsqueda…</p> : null}
      {autocompleteError ? (
        <p className={styles.error} role="alert">
          {autocompleteError}
        </p>
      ) : null}
      <div
        ref={autocompleteHostRef}
        id="checkout-delivery-address-search"
        className={styles.host}
      />

      {value.address.trim() ? (
        <p className={styles.selectedAddress} aria-live="polite">
          {value.address}
        </p>
      ) : (
        <p className={styles.hint}>Selecciona una sugerencia para ubicar tu domicilio en el mapa.</p>
      )}

      {hasCoords ? (
        <>
          <div className={styles.precisionNote} role="note">
            <MyLocationOutlinedIcon className={styles.precisionIcon} aria-hidden />
            <p className={styles.precisionText}>
              Arrastra el pin hasta la puerta de tu casa. Cuanto más exacto sea, más rápido llegará tu
              repartidor.
            </p>
          </div>

          <div className={styles.mapShell} ref={mapShellRef} aria-label="Mapa de entrega">
            {mapState === 'loading' || geocoding ? (
              <p className={styles.mapOverlay}>
                {geocoding ? 'Actualizando ubicación…' : 'Cargando mapa…'}
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
          Busca tu domicilio y ajusta el pin en el mapa para confirmar la entrega.
        </p>
      ) : null}
    </div>
  );
}
