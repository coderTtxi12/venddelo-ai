'use client';

import { useEffect, useRef, useState } from 'react';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { getGoogleMapsMapId, loadGoogleMaps } from '@/lib/loadGoogleMaps';
import styles from './RestaurantLocationPreview.module.css';

type RestaurantLocationPreviewProps = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  label?: string;
};

function mapsSearchUrl(address: string | null, lat: number | null, lng: number | null): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return 'https://www.google.com/maps';
}

export function RestaurantLocationPreview({
  address,
  latitude,
  longitude,
  label = 'Ubicación del restaurante',
}: RestaurantLocationPreviewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const hasCoords = latitude != null && longitude != null;
  const mapsUrl = mapsSearchUrl(address, latitude, longitude);

  useEffect(() => {
    if (!hasCoords || !mapRef.current) return;

    let cancelled = false;

    void loadGoogleMaps()
      .then(async () => {
        if (cancelled || !mapRef.current) return;

        const center = { lat: latitude!, lng: longitude! };
        const map =
          mapInstanceRef.current ??
          new google.maps.Map(mapRef.current, {
            center,
            zoom: 15,
            mapId: getGoogleMapsMapId(),
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'cooperative',
          });

        mapInstanceRef.current = map;
        map.setOptions({ center, zoom: 15 });

        const { AdvancedMarkerElement } = (await google.maps.importLibrary(
          'marker',
        )) as google.maps.MarkerLibrary;

        if (markerRef.current) {
          markerRef.current.map = map;
          markerRef.current.position = center;
        } else {
          markerRef.current = new AdvancedMarkerElement({
            map,
            position: center,
            title: label,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setMapError('No se pudo cargar el mapa');
      });

    return () => {
      cancelled = true;
    };
  }, [hasCoords, label, latitude, longitude]);

  return (
    <div className={styles.wrap}>
      <div className={styles.mapShell} aria-label={label}>
        {hasCoords && !mapError ? (
          <div ref={mapRef} className={styles.mapCanvas} />
        ) : (
          <div className={styles.mapFallback}>
            <LocationOnOutlinedIcon sx={{ fontSize: 28 }} aria-hidden />
            <p>{mapError ?? (address ? 'Sin coordenadas exactas' : 'Sin ubicación registrada')}</p>
          </div>
        )}
      </div>
      {address ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.mapsLink}
        >
          Abrir en Google Maps
        </a>
      ) : null}
    </div>
  );
}
