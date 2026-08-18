'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeliveryProviderZone, DispatchMonitorSnapshot, GeoJsonPolygon } from '@/lib/api/types';
import { fetchRoadRoute } from '@/lib/dispatch/fetchRoadRoute';
import { formatShortId } from '@/lib/dispatch/monitorCopy';
import { motorcycleColorHex } from '@/lib/drivers/motorcycleColors';
import { getGoogleMapsMapId, loadGoogleMaps } from '@/lib/loadGoogleMaps';
import styles from './DispatchMonitorMap.module.css';

type DispatchMonitorMapProps = {
  snapshot: DispatchMonitorSnapshot | null;
  zones: DeliveryProviderZone[];
  selectedZoneId: string | null;
  focusedRequestId?: string | null;
  focusedDriverId?: string | null;
};

const ZONE_STYLE = {
  fillColor: '#93C5FD',
  fillOpacity: 0.16,
  strokeColor: '#2563EB',
  strokeWeight: 2,
  strokeOpacity: 0.7,
  editable: false,
  draggable: false,
  clickable: false,
  zIndex: 1,
} as const;

const SELECTED_ZONE_STYLE = {
  fillColor: '#2563EB',
  fillOpacity: 0.18,
  strokeColor: '#1D4ED8',
  strokeWeight: 2.5,
  strokeOpacity: 0.95,
  editable: false,
  draggable: false,
  clickable: false,
  zIndex: 2,
} as const;

const PENDING_REQUEST_STATUSES = new Set(['scheduled', 'searching', 'offered', 'unassigned']);

const REQUEST_ROUTE_STYLE: google.maps.PolylineOptions = {
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

const FOCUSED_REQUEST_ROUTE_STYLE: google.maps.PolylineOptions = {
  strokeColor: '#EA580C',
  strokeOpacity: 0,
  strokeWeight: 3.5,
  geodesic: true,
  clickable: false,
  zIndex: 8,
  icons: [
    {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: '#EA580C',
        scale: 3,
      },
      offset: '0',
      repeat: '10px',
    },
  ],
};

const ACTIVE_ROUTE_STYLE: google.maps.PolylineOptions = {
  strokeColor: '#2563EB',
  strokeOpacity: 0.85,
  strokeWeight: 3,
  geodesic: true,
  clickable: false,
  zIndex: 4,
};

const FOCUSED_ACTIVE_ROUTE_STYLE: google.maps.PolylineOptions = {
  strokeColor: '#1D4ED8',
  strokeOpacity: 0.95,
  strokeWeight: 5,
  geodesic: true,
  clickable: false,
  zIndex: 9,
};

function geoJsonToLatLngRing(polygon: GeoJsonPolygon): google.maps.LatLngLiteral[] {
  const source = polygon.coordinates?.[0] ?? [];
  return source
    .filter((_, index, arr) => {
      if (index !== arr.length - 1) return true;
      const first = arr[0];
      const last = arr[index];
      return first[0] !== last[0] || first[1] !== last[1];
    })
    .map(([lng, lat]) => ({ lat, lng }));
}

function ringCentroid(ring: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral | null {
  if (ring.length === 0) return null;
  const sum = ring.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / ring.length, lng: sum.lng / ring.length };
}

function createZoneLabel(name: string, selected: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = selected ? `${styles.zoneLabel} ${styles.zoneLabelSelected}` : styles.zoneLabel;
  el.textContent = name;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function createRequestLabel(shortId: string, pending: boolean, focused = false): HTMLElement {
  const el = document.createElement('div');
  el.className = pending ? `${styles.requestLabel} ${styles.requestLabelPending}` : styles.requestLabel;
  if (focused) el.classList.add(styles.requestLabelFocused);
  el.textContent = formatShortId(shortId);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function segmentLength(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.hypot(dLat, dLng);
}

function pointAlongPath(
  path: google.maps.LatLngLiteral[],
  fraction = 0.5,
): google.maps.LatLngLiteral {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (path.length === 1) return path[0];

  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const length = segmentLength(path[index - 1], path[index]);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return path[Math.floor(path.length / 2)];

  let remaining = total * Math.min(1, Math.max(0, fraction));
  for (let index = 1; index < path.length; index += 1) {
    const length = lengths[index - 1];
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      const start = path[index - 1];
      const end = path[index];
      return {
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      };
    }
    remaining -= length;
  }
  return path[path.length - 1];
}

function fitBounds(map: google.maps.Map, points: google.maps.LatLngLiteral[], padding = 56): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(16);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  for (const point of points) {
    bounds.extend(point);
  }
  map.fitBounds(bounds, padding);
}

function requestRoutePoints(
  request: {
    id: string;
    assigned_driver_id: string | null;
    restaurant_lat: number | null;
    restaurant_lng: number | null;
    dropoff_lat: number;
    dropoff_lng: number;
  },
  snapshot: DispatchMonitorSnapshot,
): google.maps.LatLngLiteral[] {
  const route = snapshot.routes.find((row) => row.request_id === request.id);
  if (route) {
    return [
      { lat: route.origin_lat, lng: route.origin_lng },
      { lat: route.destination_lat, lng: route.destination_lng },
    ];
  }

  const points: google.maps.LatLngLiteral[] = [
    { lat: request.dropoff_lat, lng: request.dropoff_lng },
  ];
  if (request.restaurant_lat != null && request.restaurant_lng != null) {
    points.unshift({ lat: request.restaurant_lat, lng: request.restaurant_lng });
  }
  if (request.assigned_driver_id) {
    const driver = snapshot.drivers.find((row) => row.id === request.assigned_driver_id);
    if (driver?.last_lat != null && driver.last_lng != null) {
      points.unshift({ lat: driver.last_lat, lng: driver.last_lng });
    }
  }
  return points;
}

function zoneRingPoints(zones: DeliveryProviderZone[]): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = [];
  for (const zone of zones) {
    if (!zone.polygon) continue;
    points.push(...geoJsonToLatLngRing(zone.polygon));
  }
  return points;
}

export function DispatchMonitorMap({
  snapshot,
  zones,
  selectedZoneId,
  focusedRequestId = null,
  focusedDriverId = null,
}: DispatchMonitorMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const zonePolygonsRef = useRef<google.maps.Polygon[]>([]);
  const zoneLabelsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const lastFitKeyRef = useRef<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    void loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapRef.current, {
            center: { lat: 19.4326, lng: -99.1332 },
            zoom: 12,
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
        if (!cancelled) setMapError('No se pudo cargar el mapa');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;

    let cancelled = false;

    void (async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary(
        'marker',
      )) as google.maps.MarkerLibrary;
      if (cancelled) return;

      for (const overlay of zonePolygonsRef.current) {
        overlay.setMap(null);
      }
      for (const label of zoneLabelsRef.current) {
        label.map = null;
      }
      zonePolygonsRef.current = [];
      zoneLabelsRef.current = [];

      for (const zone of zones) {
        if (!zone.polygon) continue;
        const ring = geoJsonToLatLngRing(zone.polygon);
        if (ring.length < 3) continue;

        const selected = zone.id === selectedZoneId;
        const overlay = new google.maps.Polygon({
          paths: ring,
          map,
          ...(selected ? SELECTED_ZONE_STYLE : ZONE_STYLE),
        });
        zonePolygonsRef.current.push(overlay);

        const centroid = ringCentroid(ring);
        if (!centroid) continue;

        zoneLabelsRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: centroid,
            gmpClickable: false,
            zIndex: selected ? 4 : 3,
            content: createZoneLabel(zone.name, selected),
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, selectedZoneId, zones]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;

    if (!snapshot) {
      lastFitKeyRef.current = null;
      fitBounds(map, zoneRingPoints(zones));
      return;
    }

    let cancelled = false;

    void (async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary(
        'marker',
      )) as google.maps.MarkerLibrary;
      if (cancelled) return;

      for (const marker of markersRef.current) {
        marker.map = null;
      }
      for (const line of polylinesRef.current) {
        line.setMap(null);
      }
      markersRef.current = [];
      polylinesRef.current = [];

      const points: google.maps.LatLngLiteral[] = [];

      for (const driver of snapshot.drivers) {
        if (driver.last_lat == null || driver.last_lng == null) continue;
        const focused = driver.id === focusedDriverId;
        const position = { lat: driver.last_lat, lng: driver.last_lng };
        points.push(position);

        const pin = document.createElement('div');
        pin.className = styles.driverPin;
        if (!driver.is_online) pin.classList.add(styles.driverPinOffline);
        if (driver.location_stale) pin.classList.add(styles.driverPinStale);
        if (driver.credit_blocked) pin.classList.add(styles.driverPinBlocked);
        if (focused) pin.classList.add(styles.driverPinFocused);

        const dot = document.createElement('span');
        dot.className = styles.driverDot;
        dot.style.background = motorcycleColorHex(driver.motorcycle_color);
        pin.appendChild(dot);

        const label = document.createElement('span');
        label.className = styles.driverLabel;
        label.textContent = driver.plate;
        pin.appendChild(label);

        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position,
            title: `${driver.first_name} ${driver.last_name} · ${driver.plate} · ${driver.motorcycle_color || 'Sin color'} · ${driver.compartment_size === 'grande' ? 'Grande' : 'Normal'}`,
            content: pin,
            zIndex: focused ? 14 : undefined,
          }),
        );
      }

      for (const request of snapshot.requests) {
        const focused = request.id === focusedRequestId;
        const dropoff = { lat: request.dropoff_lat, lng: request.dropoff_lng };
        points.push(dropoff);

        const dropPin = document.createElement('div');
        dropPin.className = focused ? `${styles.dropoffPin} ${styles.dropoffPinFocused}` : styles.dropoffPin;
        dropPin.title = request.dropoff_address;

        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: dropoff,
            title: request.customer_name,
            content: dropPin,
            zIndex: focused ? 12 : undefined,
          }),
        );

        if (request.restaurant_lat != null && request.restaurant_lng != null) {
          const restaurant = { lat: request.restaurant_lat, lng: request.restaurant_lng };
          points.push(restaurant);

          const restaurantPin = document.createElement('div');
          restaurantPin.className = focused
            ? `${styles.restaurantPin} ${styles.restaurantPinFocused}`
            : styles.restaurantPin;

          markersRef.current.push(
            new AdvancedMarkerElement({
              map,
              position: restaurant,
              title: request.restaurant_name,
              content: restaurantPin,
              zIndex: focused ? 12 : undefined,
            }),
          );
        }
      }

      const pendingRequests = snapshot.requests.filter(
        (request) =>
          PENDING_REQUEST_STATUSES.has(request.status) &&
          request.restaurant_lat != null &&
          request.restaurant_lng != null,
      );

      const [pendingRoadPaths, roadPaths] = await Promise.all([
        Promise.all(
          pendingRequests.map(async (request) => {
            const origin = {
              lat: request.restaurant_lat!,
              lng: request.restaurant_lng!,
            };
            const destination = { lat: request.dropoff_lat, lng: request.dropoff_lng };
            const road = await fetchRoadRoute(origin, destination);
            return {
              request,
              path: road && road.length > 1 ? road : [origin, destination],
            };
          }),
        ),
        Promise.all(
          snapshot.routes.map(async (route) => {
            const origin = { lat: route.origin_lat, lng: route.origin_lng };
            const destination = { lat: route.destination_lat, lng: route.destination_lng };
            const road = await fetchRoadRoute(origin, destination);
            return {
              route,
              path: road && road.length > 1 ? road : [origin, destination],
            };
          }),
        ),
      ]);

      if (cancelled) return;

      for (const { request, path } of pendingRoadPaths) {
        const focused = request.id === focusedRequestId;
        points.push(path[0], path[path.length - 1]);
        polylinesRef.current.push(
          new google.maps.Polyline({
            map,
            path,
            ...(focused ? FOCUSED_REQUEST_ROUTE_STYLE : REQUEST_ROUTE_STYLE),
          }),
        );
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: pointAlongPath(path),
            gmpClickable: false,
            zIndex: focused ? 10 : 6,
            content: createRequestLabel(request.short_id, true, focused),
          }),
        );
      }

      for (const { route, path } of roadPaths) {
        const focused = route.request_id === focusedRequestId;
        points.push(path[0], path[path.length - 1]);
        polylinesRef.current.push(
          new google.maps.Polyline({
            map,
            path,
            ...(focused ? FOCUSED_ACTIVE_ROUTE_STYLE : ACTIVE_ROUTE_STYLE),
          }),
        );
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: pointAlongPath(path),
            gmpClickable: false,
            zIndex: focused ? 11 : 7,
            content: createRequestLabel(route.short_id, false, focused),
          }),
        );
      }

      const focusedDriver = focusedDriverId
        ? snapshot.drivers.find((row) => row.id === focusedDriverId) ?? null
        : null;
      const focusedDriverPoint =
        focusedDriver?.last_lat != null && focusedDriver.last_lng != null
          ? [{ lat: focusedDriver.last_lat, lng: focusedDriver.last_lng }]
          : [];
      const focusedRequest = focusedRequestId
        ? snapshot.requests.find((row) => row.id === focusedRequestId) ?? null
        : null;
      const focusedRoad = focusedRequest
        ? roadPaths.find((row) => row.route.request_id === focusedRequest.id)
        : undefined;
      const focusedPendingRoad = focusedRequest
        ? pendingRoadPaths.find((row) => row.request.id === focusedRequest.id)
        : undefined;
      const focusedRequestPoints = focusedRequest
        ? focusedRoad && focusedRoad.path.length > 1
          ? focusedRoad.path
          : focusedPendingRoad && focusedPendingRoad.path.length > 1
            ? focusedPendingRoad.path
            : requestRoutePoints(focusedRequest, snapshot)
        : [];

      let fitKey = `all:${snapshot.generated_at}`;
      let nextPoints: google.maps.LatLngLiteral[] | null = points;
      let padding = 56;

      if (focusedDriver) {
        fitKey =
          focusedDriverPoint.length > 0
            ? `driver:${focusedDriver.id}:${focusedDriverPoint[0].lat},${focusedDriverPoint[0].lng}`
            : `driver:${focusedDriver.id}:none`;
        nextPoints = focusedDriverPoint.length > 0 ? focusedDriverPoint : null;
        padding = 88;
      } else if (focusedRequest) {
        fitKey = `request:${focusedRequest.id}`;
        nextPoints = focusedRequestPoints.length > 0 ? focusedRequestPoints : points;
        padding = 88;
      } else {
        fitKey = `overview:${points.length}:${points[0]?.lat ?? 0},${points[0]?.lng ?? 0}`;
      }

      if (lastFitKeyRef.current !== fitKey) {
        if (nextPoints && nextPoints.length > 0) {
          fitBounds(map, nextPoints, padding);
        } else if (!focusedDriver) {
          fitBounds(map, zoneRingPoints(zones));
        }
        lastFitKeyRef.current = fitKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [focusedDriverId, focusedRequestId, mapReady, snapshot, zones]);

  if (mapError) {
    return (
      <div className={styles.fallback}>
        <p>{mapError}</p>
      </div>
    );
  }

  return <div ref={mapRef} className={styles.map} aria-label="Mapa de operación" />;
}
