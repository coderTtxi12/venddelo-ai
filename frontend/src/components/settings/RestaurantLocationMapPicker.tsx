'use client';

import PinDropOutlinedIcon from '@mui/icons-material/PinDropOutlined';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { formatGeoCoordinate } from '@/lib/googleMaps';
import {
  fetchPlaceById,
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  loadGoogleMapsEditor,
  type MapLocationUpdate,
} from '@/lib/loadGoogleMapsPlaces';
import styles from './RestaurantLocationMapPicker.module.css';

type RestaurantLocationMapPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (location: MapLocationUpdate) => void;
  /** Texto del botón de guardado mostrado en las instrucciones del mapa. */
  saveHintLabel?: string;
};

export type RestaurantLocationMapPickerHandle = {
  getPosition: () => { latitude: number; longitude: number } | null;
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

export const RestaurantLocationMapPicker = forwardRef<
  RestaurantLocationMapPickerHandle,
  RestaurantLocationMapPickerProps
>(function RestaurantLocationMapPicker(
  { latitude, longitude, onLocationChange, saveHintLabel = 'Guardar configuración' },
  ref,
) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const dragEndListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const skipDragEmitRef = useRef(false);
  const onLocationChangeRef = useRef(onLocationChange);

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [liveCoords, setLiveCoords] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  onLocationChangeRef.current = onLocationChange;

  const hasCoords = latitude != null && longitude != null;

  const displayCoords =
    liveCoords ??
    (latitude != null && longitude != null ? { latitude, longitude } : null);

  useImperativeHandle(
    ref,
    () => ({
      getPosition: () =>
        readMarkerCoords(markerRef.current?.position) ??
        liveCoords ??
        (latitude != null && longitude != null ? { latitude, longitude } : null),
    }),
    [latitude, liveCoords, longitude],
  );

  const emitMarkerPosition = useCallback(() => {
    if (skipDragEmitRef.current) return;
    const coords = readMarkerCoords(markerRef.current?.position);
    if (!coords) return;
    setLiveCoords(coords);
    onLocationChangeRef.current(coords);
  }, []);

  const applyLocationUpdate = useCallback((update: MapLocationUpdate) => {
    skipDragEmitRef.current = true;
    if (markerRef.current) {
      markerRef.current.position = { lat: update.latitude, lng: update.longitude };
    }
    mapRef.current?.panTo({ lat: update.latitude, lng: update.longitude });
    mapRef.current?.setZoom(DEFAULT_ZOOM);
    setLiveCoords({ latitude: update.latitude, longitude: update.longitude });
    skipDragEmitRef.current = false;
    onLocationChangeRef.current(update);
  }, []);

  const handleMapPoiClick = useCallback(async (event: google.maps.MapMouseEvent) => {
    if (!event.placeId) return;

    event.stop();

    try {
      const place = await fetchPlaceById(event.placeId);
      applyLocationUpdate({
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        placeId: place.placeId,
      });
    } catch (error) {
      console.error(error);
      const latLng = event.latLng;
      if (!latLng) return;
      applyLocationUpdate({
        latitude: latLng.lat(),
        longitude: latLng.lng(),
      });
    }
  }, [applyLocationUpdate]);

  const syncMarkerPosition = useCallback((lat: number, lng: number) => {
    const position = { lat, lng };
    skipDragEmitRef.current = true;
    if (markerRef.current) {
      markerRef.current.position = position;
    }
    mapRef.current?.panTo(position);
    mapRef.current?.setZoom(DEFAULT_ZOOM);
    setLiveCoords({ latitude: lat, longitude: lng });
    skipDragEmitRef.current = false;
  }, []);

  useEffect(() => {
    if (latitude != null && longitude != null) {
      setLiveCoords({ latitude, longitude });
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (!hasCoords || latitude == null || longitude == null) {
      setLoadState('idle');
      return;
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      setLoadState('error');
      return;
    }

    if (mapRef.current && markerRef.current) {
      syncMarkerPosition(latitude, longitude);
      setLoadState('ready');
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoadState('loading');
      try {
        await loadGoogleMapsEditor();
        if (cancelled || !mapContainerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        const { AdvancedMarkerElement } = (await google.maps.importLibrary(
          'marker',
        )) as google.maps.MarkerLibrary;
        const position = { lat: latitude, lng: longitude };

        mapRef.current = new Map(mapContainerRef.current, {
          center: position,
          zoom: DEFAULT_ZOOM,
          mapId: getGoogleMapsMapId(),
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: true,
        });

        markerRef.current = new AdvancedMarkerElement({
          map: mapRef.current,
          position,
          gmpDraggable: true,
          title: 'Ubicación del restaurante',
        });

        dragEndListenerRef.current = markerRef.current.addListener('dragend', emitMarkerPosition);
        mapClickListenerRef.current = mapRef.current.addListener('click', (event) => {
          void handleMapPoiClick(event);
        });

        if (!cancelled) setLoadState('ready');
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyLocationUpdate, emitMarkerPosition, handleMapPoiClick, hasCoords, latitude, longitude, syncMarkerPosition]);

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

  if (!hasCoords) {
    return (
      <div className={styles.emptyState} role="status">
        Busca y selecciona una dirección para mostrar el mapa interactivo.
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.instructions} role="note">
        <PinDropOutlinedIcon className={styles.instructionsIcon} aria-hidden />
        <div>
          <p className={styles.instructionsTitle}>Ajusta la ubicación exacta</p>
          <p className={styles.instructionsText}>
            Haz clic en un negocio del mapa, arrastra el pin rojo hasta la entrada exacta o usa el
            buscador. Los cambios se guardan al pulsar <strong>{saveHintLabel}</strong>.
          </p>
        </div>
      </div>

      <div className={styles.mapShell} aria-label="Mapa interactivo de ubicación">
        {loadState === 'loading' ? (
          <p className={styles.mapOverlay}>Cargando mapa…</p>
        ) : null}
        {loadState === 'error' ? (
          <p className={styles.mapOverlayError}>
            No se pudo cargar el mapa. Verifica que{' '}
            <strong>Maps JavaScript API</strong> esté activada en Google Cloud Console para tu
            clave, que <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> sea correcta y que la facturación
            del proyecto esté habilitada.
          </p>
        ) : null}
        <div ref={mapContainerRef} className={styles.mapCanvas} />
      </div>

      <div className={styles.footer}>
        <p className={styles.coords} aria-live="polite">
          {displayCoords != null
            ? `${formatGeoCoordinate(displayCoords.latitude)}, ${formatGeoCoordinate(displayCoords.longitude)}`
            : '—'}
        </p>
      </div>
    </div>
  );
});
