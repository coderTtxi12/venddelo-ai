'use client';

import { useEffect, useRef, useState } from 'react';
import type { DispatchStatus, PublicDispatchTracking } from '@/lib/api/dispatch';
import { fetchRoadRoute, fetchStableRoadPath } from '@/lib/dispatch/fetchRoadRoute';
import { remainingPathFrom } from '@/lib/dispatch/remainingRoadPath';
import { getGoogleMapsMapId, loadGoogleMaps } from '@/lib/loadGoogleMapsPlaces';
import styles from './PublicTrackingMap.module.css';

type PublicTrackingMapProps = {
  tracking: PublicDispatchTracking;
};

const PENDING_STATUSES = new Set<DispatchStatus>([
  'scheduled',
  'searching',
  'offered',
  'unassigned',
]);

const ACTIVE_ROUTE_STYLE: google.maps.PolylineOptions = {
  strokeColor: '#2563EB',
  strokeOpacity: 0.9,
  strokeWeight: 5,
  geodesic: true,
  clickable: false,
  zIndex: 6,
};

const PENDING_ROUTE_STYLE: google.maps.PolylineOptions = {
  strokeColor: '#F97316',
  strokeOpacity: 0,
  strokeWeight: 2.5,
  geodesic: true,
  clickable: false,
  zIndex: 3,
  icons: [
    {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 0.9,
        strokeColor: '#F97316',
        scale: 2.5,
      },
      offset: '0',
      repeat: '10px',
    },
  ],
};

const COLOR_HEX: Record<string, string> = {
  negro: '#111827',
  blanco: '#F8FAFC',
  rojo: '#DC2626',
  azul: '#1D4ED8',
  gris: '#64748B',
  plata: '#94A3B8',
  verde: '#15803D',
  amarillo: '#CA8A04',
  naranja: '#EA580C',
  cafe: '#92400E',
  café: '#92400E',
  morado: '#7C3AED',
};

function motorcycleColorHex(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return COLOR_HEX[trimmed.toLowerCase()] ?? '#2563EB';
}

function fitBounds(map: google.maps.Map, points: google.maps.LatLngLiteral[], padding = 72): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(15);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  for (const point of points) {
    bounds.extend(point);
  }
  map.fitBounds(bounds, padding);
}

function routeCaption(status: DispatchStatus, hasRider: boolean): string {
  if (status === 'assigned' && hasRider) return 'El repartidor va rumbo al restaurante';
  if ((status === 'picked_up' || status === 'in_transit') && hasRider) {
    return 'El repartidor va rumbo a tu ubicación';
  }
  if (PENDING_STATUSES.has(status)) return 'Ruta del restaurante a tu destino';
  if (status === 'delivered') return 'Entrega completada';
  return 'Ubicación de entrega';
}

export function PublicTrackingMap({ tracking }: PublicTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const lastFitKeyRef = useRef<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const riderLat = tracking.rider?.latitude ?? null;
  const riderLng = tracking.rider?.longitude ?? null;
  const hasLiveRider = riderLat != null && riderLng != null;

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    void loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapRef.current, {
            center: {
              lat: tracking.dropoff.latitude,
              lng: tracking.dropoff.longitude,
            },
            zoom: 14,
            mapId: getGoogleMapsMapId(),
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            gestureHandling: 'greedy',
          });
        }
        setMapError(null);
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError('No se pudo cargar el mapa en vivo.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tracking.dropoff.latitude, tracking.dropoff.longitude]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;
    let cancelled = false;

    void (async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary(
        'marker',
      )) as google.maps.MarkerLibrary;
      if (cancelled) return;

      for (const marker of markersRef.current) marker.map = null;
      for (const line of polylinesRef.current) line.setMap(null);
      markersRef.current = [];
      polylinesRef.current = [];

      const points: google.maps.LatLngLiteral[] = [];
      const dropoff = {
        lat: tracking.dropoff.latitude,
        lng: tracking.dropoff.longitude,
      };
      points.push(dropoff);

      const dropPin = document.createElement('div');
      dropPin.className = styles.dropoffPin;
      dropPin.title = tracking.dropoff.address;
      markersRef.current.push(
        new AdvancedMarkerElement({
          map,
          position: dropoff,
          title: 'Destino',
          content: dropPin,
          zIndex: 8,
        }),
      );

      const pickup =
        tracking.pickup != null
          ? { lat: tracking.pickup.latitude, lng: tracking.pickup.longitude }
          : null;
      if (pickup) {
        points.push(pickup);
        const restaurantPin = document.createElement('div');
        restaurantPin.className = styles.restaurantPin;
        restaurantPin.title = tracking.pickup?.name ?? 'Restaurante';
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: pickup,
            title: tracking.pickup?.name ?? 'Restaurante',
            content: restaurantPin,
            zIndex: 8,
          }),
        );
      }

      const rider =
        hasLiveRider && riderLat != null && riderLng != null
          ? { lat: riderLat, lng: riderLng }
          : null;
      if (rider && tracking.rider) {
        points.unshift(rider);
        const pin = document.createElement('div');
        pin.className = styles.riderPin;
        const dot = document.createElement('span');
        dot.className = styles.riderDot;
        dot.style.background = motorcycleColorHex(tracking.rider.motorcycle_color);
        pin.appendChild(dot);
        const label = document.createElement('span');
        label.className = styles.riderLabel;
        label.textContent = tracking.rider.plate_suffix
          ? `···${tracking.rider.plate_suffix}`
          : tracking.rider.first_name;
        pin.appendChild(label);
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: rider,
            title: `${tracking.rider.first_name} · moto`,
            content: pin,
            zIndex: 12,
          }),
        );
      }

      let destination: google.maps.LatLngLiteral | null = null;
      if (tracking.status === 'assigned' && rider && pickup) {
        destination = pickup;
      } else if (
        (tracking.status === 'picked_up' || tracking.status === 'in_transit') &&
        rider
      ) {
        destination = dropoff;
      } else if (PENDING_STATUSES.has(tracking.status) && pickup) {
        destination = dropoff;
      }

      const origin =
        rider && (tracking.status === 'assigned' || tracking.status === 'picked_up' || tracking.status === 'in_transit')
          ? rider
          : pickup;

      if (origin && destination) {
        const liveRoute =
          tracking.status === 'assigned' ||
          tracking.status === 'picked_up' ||
          tracking.status === 'in_transit';
        const full = liveRoute
          ? await fetchStableRoadPath(
              `${tracking.status}:${destination.lat}:${destination.lng}`,
              origin,
              destination,
            )
          : (await fetchRoadRoute(origin, destination)) ?? [origin, destination];
        if (cancelled) return;
        const path =
          liveRoute && rider ? remainingPathFrom(full, rider) : full.length > 1 ? full : [origin, destination];
        points.push(path[0], path[path.length - 1]);
        polylinesRef.current.push(
          new google.maps.Polyline({
            map,
            path,
            ...(liveRoute ? ACTIVE_ROUTE_STYLE : PENDING_ROUTE_STYLE),
          }),
        );
      }

      const fitKey = [
        tracking.status,
        rider ? 'rider' : 'norider',
        pickup ? 'pickup' : 'nopickup',
      ].join(':');
      if (lastFitKeyRef.current !== fitKey) {
        fitBounds(map, points);
        lastFitKeyRef.current = fitKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasLiveRider,
    mapReady,
    riderLat,
    riderLng,
    tracking.dropoff.address,
    tracking.dropoff.latitude,
    tracking.dropoff.longitude,
    tracking.pickup,
    tracking.rider,
    tracking.status,
  ]);

  if (mapError) {
    return (
      <div className={styles.fallback} role="status">
        {mapError}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div ref={mapRef} className={styles.map} aria-label="Mapa de rastreo en vivo" />
      <div className={styles.meta}>
        <p className={styles.caption}>{routeCaption(tracking.status, hasLiveRider)}</p>
        <ul className={styles.legend} aria-label="Simbología del mapa">
          <li>
            <span className={styles.legendRestaurant} aria-hidden />
            Restaurante
          </li>
          <li>
            <span className={styles.legendDropoff} aria-hidden />
            Destino
          </li>
          <li>
            <span className={styles.legendRider} aria-hidden />
            Repartidor
          </li>
        </ul>
      </div>
    </div>
  );
}
