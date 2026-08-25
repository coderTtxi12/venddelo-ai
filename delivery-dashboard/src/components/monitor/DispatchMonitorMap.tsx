'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeliveryProviderZone, DispatchMonitorSnapshot, GeoJsonPolygon } from '@/lib/api/types';
import {
  buildDriverItinerary,
  itineraryFitPoints,
  itineraryLegs,
  pickupBeforeDropoff,
} from '@/lib/dispatch/driverItinerary';
import { liveBusinessesFromRequests } from '@/lib/dispatch/liveBusinesses';
import { fetchRoadRoute, fetchStableRoadPath } from '@/lib/dispatch/fetchRoadRoute';
import { remainingPathFrom } from '@/lib/dispatch/remainingRoadPath';
import {
  formatShortId,
  requestMoneyLine,
  requestPackageLine,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import { ALL_ZONES_ID, zoneColorForId, type ZoneColor } from '@/lib/dispatch/zoneColors';
import { motorcycleColorHex } from '@/lib/drivers/motorcycleColors';
import { getGoogleMapsMapId, loadGoogleMaps } from '@/lib/loadGoogleMaps';
import styles from './DispatchMonitorMap.module.css';

type DispatchMonitorMapProps = {
  snapshot: DispatchMonitorSnapshot | null;
  zones: DeliveryProviderZone[];
  selectedZoneId: string | null;
  focusedRequestId?: string | null;
  focusedDriverId?: string | null;
  focusedRestaurantId?: string | null;
  onReorderItinerary?: (
    driverId: string,
    stops: Array<{ kind: 'restaurant' | 'dropoff'; request_id: string }>,
  ) => void;
};

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

function zonePolygonStyle(color: ZoneColor, emphasized: boolean) {
  return {
    fillColor: color.fill,
    fillOpacity: emphasized ? 0.18 : 0.14,
    strokeColor: color.stroke,
    strokeWeight: emphasized ? 2.5 : 2,
    strokeOpacity: emphasized ? 0.95 : 0.8,
    editable: false,
    draggable: false,
    clickable: false,
    zIndex: emphasized ? 2 : 1,
  } as const;
}

const PENDING_REQUEST_STATUSES = new Set(['scheduled', 'searching', 'offered', 'unassigned']);

type PendingDashMode = 'normal' | 'focused' | 'dimmed';

function pendingDashMode(
  requestId: string,
  restaurantId: string | undefined,
  focusedRequestId: string | null,
  focusedRestaurantId: string | null,
): PendingDashMode {
  if (focusedRequestId) {
    if (requestId === focusedRequestId) return 'focused';
    return 'dimmed';
  }
  if (focusedRestaurantId) {
    if (restaurantId === focusedRestaurantId) return 'normal';
    return 'dimmed';
  }
  return 'normal';
}

function dashedPolylineStyle(color: string, mode: PendingDashMode): google.maps.PolylineOptions {
  const focused = mode === 'focused';
  const dimmed = mode === 'dimmed';
  return {
    strokeColor: color,
    strokeOpacity: 0,
    strokeWeight: focused ? 5 : dimmed ? 2 : 2.5,
    geodesic: true,
    clickable: false,
    zIndex: focused ? 10 : dimmed ? 2 : 3,
    icons: [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: focused ? 1 : dimmed ? 0.28 : 0.9,
          strokeColor: color,
          scale: focused ? 4 : dimmed ? 2 : 2.5,
        },
        offset: '0',
        repeat: dimmed ? '14px' : '10px',
      },
    ],
  };
}

function focusedDashedHaloStyle(): google.maps.PolylineOptions {
  return {
    strokeColor: '#FFFFFF',
    strokeOpacity: 0,
    strokeWeight: 8,
    geodesic: true,
    clickable: false,
    zIndex: 9,
    icons: [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 0.95,
          strokeColor: '#FFFFFF',
          scale: 5.5,
        },
        offset: '0',
        repeat: '10px',
      },
    ],
  };
}

function coloredPolylineStyle(
  color: string,
  focused: boolean,
  dimmed = false,
): google.maps.PolylineOptions {
  return {
    strokeColor: color,
    strokeOpacity: dimmed ? 0.28 : focused ? 0.95 : 0.85,
    strokeWeight: dimmed ? 2 : focused ? 5 : 3,
    geodesic: true,
    clickable: false,
    zIndex: focused ? 12 : dimmed ? 2 : 4,
  };
}

const PENDING_ROUTE_COLOR = '#F97316';

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
  zIndex: 12,
};

const NEXT_LEG_ROUTE_STYLE: google.maps.PolylineOptions = {
  strokeColor: '#F97316',
  strokeOpacity: 0,
  strokeWeight: 3,
  geodesic: true,
  clickable: false,
  zIndex: 8,
  icons: [
    {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 0.95,
        strokeColor: '#F97316',
        scale: 3,
      },
      offset: '0',
      repeat: '10px',
    },
  ],
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

function createZoneLabel(name: string, selected: boolean, color?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = selected ? `${styles.zoneLabel} ${styles.zoneLabelSelected}` : styles.zoneLabel;
  if (color) el.style.background = color;
  el.textContent = name;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function createRequestLabel(
  shortId: string,
  pending: boolean,
  focused = false,
  color?: string,
  dimmed = false,
): HTMLElement {
  const el = document.createElement('div');
  el.className = pending ? `${styles.requestLabel} ${styles.requestLabelPending}` : styles.requestLabel;
  if (focused) el.classList.add(styles.requestLabelFocused);
  if (dimmed) el.classList.add(styles.requestLabelDim);
  if (color) el.style.background = color;
  el.textContent = formatShortId(shortId);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function createNumberedPin(
  kind: 'restaurant' | 'dropoff',
  sequence: number,
  current: boolean,
  color?: string,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = styles.stopPin;
  const badge = document.createElement('span');
  badge.className = current ? `${styles.stopBadge} ${styles.stopBadgeNow}` : styles.stopBadge;
  badge.textContent = String(sequence);
  const pin = document.createElement('div');
  pin.className = kind === 'restaurant' ? styles.restaurantPin : styles.dropoffPin;
  pin.classList.add(styles.stopPinMark);
  if (color) pin.style.background = color;
  wrap.append(badge, pin);
  wrap.setAttribute('aria-hidden', 'true');
  return wrap;
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
  focusedRestaurantId = null,
  onReorderItinerary,
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
  const itinerary = useMemo(
    () => (snapshot && focusedDriverId ? buildDriverItinerary(snapshot, focusedDriverId) : null),
    [focusedDriverId, snapshot],
  );
  const focusedBusiness = useMemo(
    () =>
      snapshot && focusedRestaurantId
        ? liveBusinessesFromRequests(snapshot.requests).find((row) => row.id === focusedRestaurantId) ??
          null
        : null,
    [focusedRestaurantId, snapshot],
  );
  const focusedRequest = useMemo(
    () =>
      snapshot && focusedRequestId
        ? snapshot.requests.find((row) => row.id === focusedRequestId) ?? null
        : null,
    [focusedRequestId, snapshot],
  );
  const colorByZone = selectedZoneId === ALL_ZONES_ID;
  const zoneIds = useMemo(() => zones.map((zone) => zone.id), [zones]);
  const visibleZones = useMemo(() => {
    if (colorByZone) return zones;
    if (!selectedZoneId) return [];
    return zones.filter((zone) => zone.id === selectedZoneId);
  }, [colorByZone, selectedZoneId, zones]);

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

      for (const zone of visibleZones) {
        if (!zone.polygon) continue;
        const ring = geoJsonToLatLngRing(zone.polygon);
        if (ring.length < 3) continue;

        const color = zoneColorForId(zone.id, zoneIds);
        const overlay = new google.maps.Polygon({
          paths: ring,
          map,
          ...(colorByZone ? zonePolygonStyle(color, true) : SELECTED_ZONE_STYLE),
        });
        zonePolygonsRef.current.push(overlay);

        const centroid = ringCentroid(ring);
        if (!centroid) continue;

        zoneLabelsRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: centroid,
            gmpClickable: false,
            zIndex: 4,
            content: createZoneLabel(zone.name, !colorByZone, colorByZone ? color.stroke : undefined),
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [colorByZone, mapReady, selectedZoneId, visibleZones, zoneIds]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;

    if (!snapshot) {
      lastFitKeyRef.current = null;
      fitBounds(map, zoneRingPoints(visibleZones));
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

      const requestZoneId = (requestId: string | null | undefined) =>
        snapshot.requests.find((row) => row.id === requestId)?.zone_id ?? null;
      const driverZoneId = (driver: (typeof snapshot.drivers)[number]) =>
        requestZoneId(driver.active_request_id) ?? driver.registered_zone_id ?? null;
      const colorFor = (zoneId: string | null | undefined) =>
        colorByZone ? zoneColorForId(zoneId, zoneIds).solid : undefined;
      const restaurantRequestIds = new Set(
        focusedRestaurantId
          ? snapshot.requests
              .filter((row) => row.restaurant_id === focusedRestaurantId)
              .map((row) => row.id)
          : [],
      );
      const restaurantDriverIds = new Set(
        focusedRestaurantId
          ? snapshot.requests
              .filter(
                (row) =>
                  row.restaurant_id === focusedRestaurantId && row.assigned_driver_id,
              )
              .map((row) => row.assigned_driver_id as string)
          : [],
      );

      for (const driver of snapshot.drivers) {
        if (driver.last_lat == null || driver.last_lng == null) continue;
        const focused = driver.id === focusedDriverId;
        const position = { lat: driver.last_lat, lng: driver.last_lng };

        const pin = document.createElement('div');
        pin.className = styles.driverPin;
        if (!driver.is_online) pin.classList.add(styles.driverPinOffline);
        if (driver.location_stale) pin.classList.add(styles.driverPinStale);
        if (driver.credit_blocked) pin.classList.add(styles.driverPinBlocked);
        if (focused) pin.classList.add(styles.driverPinFocused);
        if (focusedDriverId && !focused) pin.classList.add(styles.pinDim);
        if (focusedRestaurantId && !restaurantDriverIds.has(driver.id)) {
          pin.classList.add(styles.pinDim);
        }
        const driverColor = colorFor(driverZoneId(driver));
        if (driverColor) {
          const swatch = document.createElement('span');
          swatch.className = styles.zonePinSwatch;
          swatch.style.background = driverColor;
          pin.appendChild(swatch);
        }

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

      if (itinerary) {
        for (const stop of itinerary.stops) {
          if (stop.kind !== 'restaurant' && stop.kind !== 'dropoff') continue;
          const position = { lat: stop.lat, lng: stop.lng };
          const pin = createNumberedPin(
            stop.kind,
            stop.sequence ?? 0,
            stop.current,
            colorFor(requestZoneId(stop.requestId)),
          );
          pin.title = `${stop.sequence}. ${stop.action} · ${stop.title}`;
          markersRef.current.push(
            new AdvancedMarkerElement({
              map,
              position,
              title: `${stop.sequence}. ${stop.action} · ${stop.title}`,
              content: pin,
              zIndex: stop.current ? 13 : 12,
            }),
          );
        }
      } else {
        for (const request of snapshot.requests) {
          const requestFocused = request.id === focusedRequestId;
          const restaurantFocused = Boolean(
            focusedRestaurantId && request.restaurant_id === focusedRestaurantId,
          );
          const dimOther =
            (Boolean(focusedRequestId) && !requestFocused) ||
            (Boolean(focusedRestaurantId) && !restaurantFocused);
          const highlightPin = requestFocused || restaurantFocused;
          const dropoff = { lat: request.dropoff_lat, lng: request.dropoff_lng };

          const dropPin = document.createElement('div');
          dropPin.className = [
            styles.dropoffPin,
            highlightPin ? styles.dropoffPinFocused : '',
            dimOther ? styles.pinDim : '',
          ]
            .filter(Boolean)
            .join(' ');
          const dropColor = colorFor(request.zone_id);
          if (dropColor) dropPin.style.background = dropColor;
          dropPin.title = request.dropoff_address;

          markersRef.current.push(
            new AdvancedMarkerElement({
              map,
              position: dropoff,
              title: request.customer_name,
              content: dropPin,
              zIndex: highlightPin ? 16 : undefined,
            }),
          );

          if (request.restaurant_lat != null && request.restaurant_lng != null) {
            const restaurant = { lat: request.restaurant_lat, lng: request.restaurant_lng };

            const restaurantPin = document.createElement('div');
            restaurantPin.className = [
              styles.restaurantPin,
              highlightPin ? styles.restaurantPinFocused : '',
              dimOther ? styles.pinDim : '',
            ]
              .filter(Boolean)
              .join(' ');
            const restaurantColor = colorFor(request.zone_id);
            if (restaurantColor) restaurantPin.style.background = restaurantColor;

            markersRef.current.push(
              new AdvancedMarkerElement({
                map,
                position: restaurant,
                title: request.restaurant_name,
                content: restaurantPin,
                zIndex: highlightPin ? 16 : undefined,
              }),
            );
          }
        }
      }

      const pendingRequests = itinerary
        ? []
        : snapshot.requests.filter(
            (request) =>
              PENDING_REQUEST_STATUSES.has(request.status) &&
              request.restaurant_lat != null &&
              request.restaurant_lng != null,
          );
      const activeRoutes = itinerary ? [] : snapshot.routes;

      const [pendingRoadPaths, roadPaths, itineraryRoadPaths] = await Promise.all([
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
          activeRoutes.map(async (route) => {
            const driver = snapshot.drivers.find((row) => row.id === route.driver_id);
            const destination = { lat: route.destination_lat, lng: route.destination_lng };
            const rider =
              driver?.last_lat != null && driver.last_lng != null
                ? { lat: driver.last_lat, lng: driver.last_lng }
                : { lat: route.origin_lat, lng: route.origin_lng };
            const full = await fetchStableRoadPath(
              `${route.request_id}:${route.status}:${destination.lat}:${destination.lng}`,
              rider,
              destination,
            );
            return {
              route,
              path: remainingPathFrom(full, rider),
            };
          }),
        ),
        Promise.all(
          itinerary
            ? itineraryLegs(itinerary).map(async (leg, index) => {
                if (index === 0 && itinerary.origin) {
                  const rider = { lat: itinerary.origin.lat, lng: itinerary.origin.lng };
                  const full = await fetchStableRoadPath(
                    `${itinerary.driverId}:${leg.to.lat}:${leg.to.lng}`,
                    rider,
                    leg.to,
                  );
                  return {
                    current: leg.current,
                    path: remainingPathFrom(full, rider),
                  };
                }
                const road = await fetchRoadRoute(leg.from, leg.to);
                return {
                  current: leg.current,
                  path: road && road.length > 1 ? road : [leg.from, leg.to],
                };
              })
            : [],
        ),
      ]);

      if (cancelled) return;

      for (const { request, path } of pendingRoadPaths) {
        const focused = request.id === focusedRequestId;
        const mode = pendingDashMode(
          request.id,
          request.restaurant_id,
          focusedRequestId,
          focusedRestaurantId,
        );
        if (mode === 'focused') {
          polylinesRef.current.push(
            new google.maps.Polyline({
              map,
              path,
              ...focusedDashedHaloStyle(),
            }),
          );
        }
        polylinesRef.current.push(
          new google.maps.Polyline({
            map,
            path,
            ...dashedPolylineStyle(PENDING_ROUTE_COLOR, mode),
          }),
        );
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: pointAlongPath(path),
            gmpClickable: false,
            zIndex: focused ? 18 : mode === 'dimmed' ? 5 : 6,
            content: createRequestLabel(
              request.short_id,
              true,
              focused,
              undefined,
              mode === 'dimmed',
            ),
          }),
        );
      }

      for (const { route, path } of roadPaths) {
        const focused = route.request_id === focusedRequestId;
        const restaurantOwned = restaurantRequestIds.has(route.request_id);
        const dimmed = Boolean(focusedRestaurantId) && !restaurantOwned;
        const zoneColor = colorFor(route.zone_id ?? requestZoneId(route.request_id));
        polylinesRef.current.push(
          new google.maps.Polyline({
            map,
            path,
            ...(zoneColor
              ? coloredPolylineStyle(zoneColor, focused || restaurantOwned, dimmed)
              : focused || restaurantOwned
                ? FOCUSED_ACTIVE_ROUTE_STYLE
                : dimmed
                  ? { ...ACTIVE_ROUTE_STYLE, strokeOpacity: 0.28, strokeWeight: 2, zIndex: 2 }
                  : ACTIVE_ROUTE_STYLE),
          }),
        );
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position: pointAlongPath(path),
            gmpClickable: false,
            zIndex: focused || restaurantOwned ? 18 : dimmed ? 5 : 7,
            content: createRequestLabel(
              route.short_id,
              false,
              focused || restaurantOwned,
              zoneColor,
              dimmed,
            ),
          }),
        );
      }

      for (const { current, path } of itineraryRoadPaths) {
        polylinesRef.current.push(
          new google.maps.Polyline({
            map,
            path,
            ...(current ? FOCUSED_ACTIVE_ROUTE_STYLE : NEXT_LEG_ROUTE_STYLE),
          }),
        );
      }

      const focusedDriver = focusedDriverId
        ? snapshot.drivers.find((row) => row.id === focusedDriverId) ?? null
        : null;
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
      const focusedDriverPoints = itinerary
        ? [
            ...itineraryFitPoints(itinerary),
            ...itineraryRoadPaths.flatMap((row) => row.path),
          ]
        : [];

      const focusedRestaurantPoints: google.maps.LatLngLiteral[] = [];
      if (focusedRestaurantId) {
        for (const { request, path } of pendingRoadPaths) {
          if (request.restaurant_id === focusedRestaurantId) {
            focusedRestaurantPoints.push(...path);
          }
        }
        for (const { route, path } of roadPaths) {
          if (restaurantRequestIds.has(route.request_id)) {
            focusedRestaurantPoints.push(...path);
          }
        }
        const sample = snapshot.requests.find(
          (row) => row.restaurant_id === focusedRestaurantId,
        );
        if (sample?.restaurant_lat != null && sample.restaurant_lng != null) {
          focusedRestaurantPoints.push({
            lat: sample.restaurant_lat,
            lng: sample.restaurant_lng,
          });
        }
      }

      let fitKey = `overview:${selectedZoneId ?? 'none'}`;
      let nextPoints: google.maps.LatLngLiteral[] | null = zoneRingPoints(visibleZones);
      let padding = 56;

      if (focusedDriver) {
        const itineraryKey = itinerary
          ? itinerary.stops.map((stop) => `${stop.kind}:${stop.requestId}`).join(',')
          : 'none';
        fitKey = `driver:${focusedDriver.id}:${itineraryKey}`;
        nextPoints = focusedDriverPoints.length > 0 ? focusedDriverPoints : null;
        padding = 96;
      } else if (focusedRequest) {
        fitKey = `request:${focusedRequest.id}`;
        nextPoints = focusedRequestPoints.length > 0 ? focusedRequestPoints : zoneRingPoints(visibleZones);
        padding = 88;
      } else if (focusedRestaurantId) {
        fitKey = `restaurant:${focusedRestaurantId}`;
        nextPoints =
          focusedRestaurantPoints.length > 0
            ? focusedRestaurantPoints
            : zoneRingPoints(visibleZones);
        padding = 88;
      }

      if (lastFitKeyRef.current !== fitKey) {
        if (nextPoints && nextPoints.length > 0) {
          fitBounds(map, nextPoints, padding);
        } else if (!focusedDriver) {
          fitBounds(map, zoneRingPoints(visibleZones));
        }
        lastFitKeyRef.current = fitKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [colorByZone, focusedDriverId, focusedRequestId, focusedRestaurantId, itinerary, mapReady, snapshot, visibleZones, zoneIds]);

  if (mapError) {
    return (
      <div className={styles.fallback}>
        <p>{mapError}</p>
      </div>
    );
  }

  return (
    <div className={styles.mapWrap}>
      <div ref={mapRef} className={styles.map} aria-label="Mapa de operación" />
      {itinerary ? (
        <aside className={styles.itineraryCard} aria-label={`Ruta de ${itinerary.driverName}`}>
          <p className={styles.itineraryHeading}>
            <span>{itinerary.driverName}</span>
            <span className={styles.itineraryPlate}>{itinerary.plate}</span>
          </p>
          <p className={styles.itineraryKicker}>
            Ruta fijada · arrastra para
            intercalar paradas
          </p>
          {itinerary.stops.length === 0 ? (
            <p className={styles.itineraryEmpty}>Sin pedidos en curso.</p>
          ) : (
            <ol className={styles.itineraryList}>
              {itinerary.stops.map((stop, index) => (
                <li
                  key={stop.id}
                  className={stop.current ? styles.itineraryStepNow : styles.itineraryStep}
                  aria-current={stop.current ? 'step' : undefined}
                  draggable={Boolean(onReorderItinerary)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', String(index));
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    if (!onReorderItinerary) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    if (!onReorderItinerary) return;
                    event.preventDefault();
                    const from = Number(event.dataTransfer.getData('text/plain'));
                    if (Number.isNaN(from) || from === index) return;
                    const next = [...itinerary.stops];
                    const [moved] = next.splice(from, 1);
                    next.splice(index, 0, moved);
                    const payload = next
                      .filter(
                        (item): item is typeof item & { kind: 'restaurant' | 'dropoff' } =>
                          item.kind === 'restaurant' || item.kind === 'dropoff',
                      )
                      .map((item) => ({
                        kind: item.kind,
                        request_id: item.requestId || '',
                      }))
                      .filter((item) => item.request_id);
                    if (!pickupBeforeDropoff(payload)) return;
                    onReorderItinerary(itinerary.driverId, payload);
                  }}
                >
                  <span className={stop.current ? styles.itineraryIndexNow : styles.itineraryIndex}>
                    {stop.sequence}
                  </span>
                  <span className={styles.itineraryCopy}>
                    <strong>{stop.current ? `Ahora · ${stop.action}` : stop.action}</strong>
                    <span>{stop.title}</span>
                    {stop.shortId ? (
                      <span className={styles.itineraryDetail}>{formatShortId(stop.shortId)}</span>
                    ) : null}
                    {stop.kind === 'dropoff' && stop.detail ? (
                      <span className={styles.itineraryDetail}>{stop.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      ) : focusedRequest ? (
        <aside
          className={styles.itineraryCard}
          aria-label={`Pedido ${formatShortId(focusedRequest.short_id)}`}
        >
          <p className={styles.itineraryHeading}>
            <span>{formatShortId(focusedRequest.short_id)}</span>
            <span className={styles.itineraryPlate}>
              {requestStatusLabel(focusedRequest.status)}
            </span>
          </p>
          <p className={styles.itineraryKicker}>{focusedRequest.customer_name}</p>
          <dl className={styles.requestFacts}>
            <div>
              <dt>Recoger</dt>
              <dd>
                {focusedRequest.restaurant_name}
                {focusedRequest.restaurant_address ? (
                  <span className={styles.itineraryDetail}>{focusedRequest.restaurant_address}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Entregar</dt>
              <dd>{focusedRequest.dropoff_address}</dd>
            </div>
            <div>
              <dt>Rider</dt>
              <dd>
                {focusedRequest.assigned_driver_name
                  ? `${focusedRequest.assigned_driver_name}${
                      focusedRequest.assigned_driver_plate
                        ? ` · ${focusedRequest.assigned_driver_plate}`
                        : ''
                    }`
                  : 'Sin asignar'}
              </dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>{requestMoneyLine(focusedRequest)}</dd>
            </div>
            <div>
              <dt>Paquete</dt>
              <dd>{requestPackageLine(focusedRequest)}</dd>
            </div>
            {focusedRequest.notes ? (
              <div>
                <dt>Notas</dt>
                <dd>{focusedRequest.notes}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      ) : focusedBusiness ? (
        <aside className={styles.itineraryCard} aria-label={`Negocio ${focusedBusiness.name}`}>
          <p className={styles.itineraryHeading}>
            <span>{focusedBusiness.name}</span>
          </p>
          {focusedBusiness.address ? (
            <p className={styles.itineraryKicker}>{focusedBusiness.address}</p>
          ) : (
            <p className={styles.itineraryKicker}>Sin dirección registrada</p>
          )}
          {focusedBusiness.phone ? (
            <p className={styles.itineraryKicker}>{focusedBusiness.phone}</p>
          ) : null}
          {focusedBusiness.zoneName ? (
            <p className={styles.itineraryKicker}>{focusedBusiness.zoneName}</p>
          ) : null}
          <p className={styles.itineraryKicker}>
            {focusedBusiness.queueCount} en cola · {focusedBusiness.activeCount} en curso
            {focusedBusiness.unassignedCount
              ? ` · ${focusedBusiness.unassignedCount} sin asignar`
              : ''}
          </p>
          <ol className={styles.itineraryList}>
            {focusedBusiness.requests.map((request) => (
              <li key={request.id} className={styles.itineraryStep}>
                <span className={`${styles.itineraryCopy} ${styles.businessOrder}`}>
                  <strong>
                    {formatShortId(request.short_id)} · {requestStatusLabel(request.status)}
                  </strong>
                  <span>{request.customer_name}</span>
                  <span className={styles.itineraryDetail}>{request.dropoff_address}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      ) : null}
    </div>
  );
}
