'use client';

import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import FullscreenExitOutlinedIcon from '@mui/icons-material/FullscreenExitOutlined';
import FullscreenOutlinedIcon from '@mui/icons-material/FullscreenOutlined';
import MyLocationOutlinedIcon from '@mui/icons-material/MyLocationOutlined';
import PanToolAltOutlinedIcon from '@mui/icons-material/PanToolAltOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ZonePlaceSearch } from '@/components/onboarding/ZonePlaceSearch';
import { getGoogleMapsMapId, loadGoogleMaps } from '@/lib/loadGoogleMaps';
import { attachMapProjectionHelper } from '@/lib/mapProjectionHelper';
import type { GeoJsonPolygon } from '@/lib/onboarding/types';
import styles from './ServiceZoneMapDrawer.module.css';

type ServiceZoneMapDrawerProps = {
  polygon: GeoJsonPolygon | null;
  onPolygonChange: (polygon: GeoJsonPolygon | null) => void;
  searchAddress: string;
  centerLat: number | null;
  centerLng: number | null;
  onSearchPlaceChange: (place: {
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
};

type MapTool = 'draw' | 'pan';

const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 };
const SEARCH_ZOOM = 14;
const CLOSE_SNAP_METERS = 45;
const TAP_MOVE_THRESHOLD_PX = 12;

const POLYGON_STYLE = {
  fillColor: '#9CA3AF',
  fillOpacity: 0.35,
  strokeColor: '#1F2937',
  strokeWeight: 2,
  editable: true,
  draggable: false,
};

const DRAFT_POLYGON_STYLE = {
  fillColor: '#9CA3AF',
  fillOpacity: 0.3,
  strokeColor: '#1F2937',
  strokeWeight: 2,
  clickable: false,
};

const DRAFT_LINE_STYLE = {
  strokeColor: '#1F2937',
  strokeWeight: 2,
  strokeOpacity: 1,
};

const RUBBER_BAND_STYLE = {
  strokeColor: '#6B7280',
  strokeWeight: 2,
  strokeOpacity: 0.75,
  icons: [
    {
      icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
      offset: '0',
      repeat: '12px',
    },
  ],
};

function getFullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function isMapFrameFullscreen(mapFrame: HTMLElement | null): boolean {
  const fs = getFullscreenElement();
  return Boolean(mapFrame && fs === mapFrame);
}

function requestElementFullscreen(element: HTMLElement): Promise<void> {
  const el = element as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  return Promise.reject(new Error('Fullscreen API no disponible'));
}

function exitDocumentFullscreen(): Promise<void> {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  if (doc.exitFullscreen) return doc.exitFullscreen();
  if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
  return Promise.resolve();
}

function applyMapInteractionMode(map: google.maps.Map, mode: 'navigate' | 'draw') {
  if (mode === 'draw') {
    map.setOptions({
      draggable: false,
      gestureHandling: 'none',
      scrollwheel: false,
      disableDoubleClickZoom: true,
      draggableCursor: 'crosshair',
    });
    return;
  }

  map.setOptions({
    draggable: true,
    gestureHandling: 'greedy',
    scrollwheel: true,
    disableDoubleClickZoom: false,
    draggableCursor: undefined,
  });
}

function pathToGeoJson(path: google.maps.MVCArray<google.maps.LatLng>): GeoJsonPolygon {
  const ring: number[][] = [];
  for (let i = 0; i < path.getLength(); i += 1) {
    const point = path.getAt(i);
    ring.push([point.lng(), point.lat()]);
  }
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function latLngsToGeoJson(points: google.maps.LatLngLiteral[]): GeoJsonPolygon {
  const ring = points.map((point) => [point.lng, point.lat]);
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function midpoint(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): google.maps.LatLngLiteral {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

function readMarkerCoords(
  position: google.maps.LatLngLiteral | google.maps.LatLng | null | undefined,
): google.maps.LatLngLiteral | null {
  if (!position) return null;
  if (typeof (position as google.maps.LatLng).lat === 'function') {
    const latLng = position as google.maps.LatLng;
    return { lat: latLng.lat(), lng: latLng.lng() };
  }
  return position as google.maps.LatLngLiteral;
}

function createVertexContent(closableStart: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = closableStart ? `${styles.vertexMarker} ${styles.vertexMarkerClose}` : styles.vertexMarker;
  el.setAttribute(
    'aria-label',
    closableStart ? 'Clic para cerrar el cerco' : 'Arrastra para mover el vértice',
  );
  return el;
}

function createMidpointContent(): HTMLElement {
  const el = document.createElement('div');
  el.className = styles.midpointMarker;
  el.setAttribute('aria-label', 'Añadir punto en este segmento');
  return el;
}

function createAnchorContent(): HTMLElement {
  const el = document.createElement('div');
  el.className = styles.anchorMarker;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function ServiceZoneMapDrawer({
  polygon,
  onPolygonChange,
  searchAddress,
  centerLat,
  centerLng,
  onSearchPlaceChange,
}: ServiceZoneMapDrawerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const projectionHelperRef = useRef<ReturnType<typeof attachMapProjectionHelper> | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const anchorMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const draftMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const draftMidpointsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const advancedMarkerClassRef = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );
  const draftLineRef = useRef<google.maps.Polyline | null>(null);
  const draftPreviewPolygonRef = useRef<google.maps.Polygon | null>(null);
  const rubberBandRef = useRef<google.maps.Polyline | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const pathListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const draftPointsRef = useRef<google.maps.LatLngLiteral[]>([]);
  const isDrawingRef = useRef(false);
  const mapToolRef = useRef<MapTool>('draw');
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const onPolygonChangeRef = useRef(onPolygonChange);
  onPolygonChangeRef.current = onPolygonChange;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mapTool, setMapTool] = useState<MapTool>('draw');
  const [draftCount, setDraftCount] = useState(0);
  const [canClose, setCanClose] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(Boolean(polygon?.coordinates?.[0]?.length));
  const [isMapMaximized, setIsMapMaximized] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const clearPathListeners = useCallback(() => {
    pathListenersRef.current.forEach((listener) => listener.remove());
    pathListenersRef.current = [];
  }, []);

  const clearDraftVisuals = useCallback(() => {
    draftMarkersRef.current.forEach((marker) => {
      marker.map = null;
    });
    draftMarkersRef.current = [];
    draftMidpointsRef.current.forEach((marker) => {
      marker.map = null;
    });
    draftMidpointsRef.current = [];
    draftLineRef.current?.setMap(null);
    draftLineRef.current = null;
    draftPreviewPolygonRef.current?.setMap(null);
    draftPreviewPolygonRef.current = null;
    rubberBandRef.current?.setMap(null);
    rubberBandRef.current = null;
  }, []);

  const detachDrawingListeners = useCallback(() => {
    clickListenerRef.current?.remove();
    clickListenerRef.current = null;
  }, []);

  const panToCenter = useCallback((lat: number, lng: number, zoom = SEARCH_ZOOM) => {
    const map = mapInstanceRef.current;
    const AdvancedMarkerElement = advancedMarkerClassRef.current;
    if (!map || !AdvancedMarkerElement) return;
    map.panTo({ lat, lng });
    map.setZoom(zoom);
    if (anchorMarkerRef.current) {
      anchorMarkerRef.current.map = null;
    }
    anchorMarkerRef.current = new AdvancedMarkerElement({
      map,
      position: { lat, lng },
      title: 'Zona de referencia',
      gmpClickable: false,
      content: createAnchorContent(),
    });
  }, []);

  const syncFromPolygon = useCallback(
    (overlay: google.maps.Polygon) => {
      clearPathListeners();
      const path = overlay.getPath();
      const update = () => {
        const geo = pathToGeoJson(path);
        onPolygonChangeRef.current(geo);
        setHasPolygon((path.getLength() ?? 0) >= 3);
      };
      pathListenersRef.current = [
        google.maps.event.addListener(path, 'set_at', update),
        google.maps.event.addListener(path, 'insert_at', update),
        google.maps.event.addListener(path, 'remove_at', update),
      ];
      update();
    },
    [clearPathListeners],
  );

  const mountPolygon = useCallback(
    (map: google.maps.Map, ring: google.maps.LatLngLiteral[]) => {
      polygonRef.current?.setMap(null);
      const overlay = new google.maps.Polygon({
        paths: ring,
        map,
        ...POLYGON_STYLE,
      });
      polygonRef.current = overlay;
      syncFromPolygon(overlay);
    },
    [syncFromPolygon],
  );

  const finishDrawingRef = useRef<() => void>(() => undefined);
  const insertPointAtSegmentRef = useRef<(segmentIndex: number) => void>(() => undefined);

  const refreshDraftVisuals = useCallback(
    (map: google.maps.Map) => {
      const points = draftPointsRef.current;
      const AdvancedMarkerElement = advancedMarkerClassRef.current;
      if (!AdvancedMarkerElement) return;
      clearDraftVisuals();

      points.forEach((point, index) => {
        const closable = points.length >= 3;
        const isClosableStart = index === 0 && closable;
        const marker = new AdvancedMarkerElement({
          map,
          position: point,
          gmpDraggable: true,
          gmpClickable: true,
          zIndex: isClosableStart ? 4 : 3,
          title: isClosableStart
            ? 'Clic aquí para cerrar el cerco'
            : `Vértice ${index + 1} — arrastra para mover`,
          content: createVertexContent(isClosableStart),
        });

        marker.addListener('dragend', () => {
          const position = readMarkerCoords(marker.position);
          if (!position) return;
          draftPointsRef.current[index] = position;
          refreshDraftVisuals(map);
          setDraftCount(draftPointsRef.current.length);
          setCanClose(draftPointsRef.current.length >= 3);
        });

        if (isClosableStart) {
          marker.addListener('click', () => {
            if (draftPointsRef.current.length >= 3) {
              finishDrawingRef.current();
            }
          });
        }

        draftMarkersRef.current.push(marker);
      });

      for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
        const a = points[segmentIndex];
        const b = points[segmentIndex + 1];
        const mid = midpoint(a, b);
        const midpointMarker = new AdvancedMarkerElement({
          map,
          position: mid,
          gmpDraggable: true,
          gmpClickable: true,
          zIndex: 1,
          title: 'Arrastra para añadir un punto en este segmento',
          content: createMidpointContent(),
        });

        midpointMarker.addListener('click', () => {
          insertPointAtSegmentRef.current(segmentIndex);
        });

        midpointMarker.addListener('dragend', () => {
          const position = readMarkerCoords(midpointMarker.position);
          if (!position) return;
          const next = [...draftPointsRef.current];
          next.splice(segmentIndex + 1, 0, position);
          draftPointsRef.current = next;
          setDraftCount(next.length);
          refreshDraftVisuals(map);
          setCanClose(next.length >= 3);
        });

        draftMidpointsRef.current.push(midpointMarker);
      }

      if (points.length >= 2) {
        draftLineRef.current = new google.maps.Polyline({
          path: points,
          map,
          ...DRAFT_LINE_STYLE,
        });
      }

      if (points.length >= 3) {
        draftPreviewPolygonRef.current = new google.maps.Polygon({
          paths: points,
          map,
          ...DRAFT_POLYGON_STYLE,
        });
      }

      setCanClose(points.length >= 3);
    },
    [clearDraftVisuals],
  );

  const updateRubberBand = useCallback((clientX: number, clientY: number) => {
    const map = mapInstanceRef.current;
    const projection = projectionHelperRef.current;
    const points = draftPointsRef.current;
    if (!map || !projection || !mapRef.current || points.length === 0) return;

    const rect = mapRef.current.getBoundingClientRect();
    const point = projection.containerPixelToLatLng(clientX - rect.left, clientY - rect.top);
    if (!point) return;

    const last = points[points.length - 1];
    rubberBandRef.current?.setMap(null);
    rubberBandRef.current = new google.maps.Polyline({
      path: [last, point],
      map,
      ...RUBBER_BAND_STYLE,
    });
  }, []);

  const addDraftPointRef = useRef<(point: google.maps.LatLngLiteral) => void>(() => undefined);

  const attachDrawingListeners = useCallback(
    (map: google.maps.Map) => {
      detachDrawingListeners();
      clickListenerRef.current = map.addListener('click', (event: google.maps.MapMouseEvent) => {
        const latLng = event.latLng;
        if (!latLng) return;
        addDraftPointRef.current({ lat: latLng.lat(), lng: latLng.lng() });
      });
    },
    [detachDrawingListeners],
  );

  const applyDrawingTool = useCallback(
    (tool: MapTool) => {
      const map = mapInstanceRef.current;
      if (!map || !isDrawingRef.current) return;

      mapToolRef.current = tool;
      setMapTool(tool);
      rubberBandRef.current?.setMap(null);
      rubberBandRef.current = null;

      if (tool === 'draw') {
        applyMapInteractionMode(map, 'draw');
        attachDrawingListeners(map);
        return;
      }

      detachDrawingListeners();
      applyMapInteractionMode(map, 'navigate');
    },
    [attachDrawingListeners, detachDrawingListeners],
  );

  const stopDrawing = useCallback(() => {
    const map = mapInstanceRef.current;
    detachDrawingListeners();
    clearDraftVisuals();
    draftPointsRef.current = [];
    setDraftCount(0);
    setCanClose(false);
    isDrawingRef.current = false;
    setIsDrawing(false);
    mapToolRef.current = 'draw';
    setMapTool('draw');
    pointerStartRef.current = null;
    if (map) {
      applyMapInteractionMode(map, 'navigate');
    }
  }, [clearDraftVisuals, detachDrawingListeners]);

  const clearPolygon = useCallback(() => {
    stopDrawing();
    clearPathListeners();
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    setHasPolygon(false);
    onPolygonChangeRef.current(null);
  }, [clearPathListeners, stopDrawing]);

  const finishDrawing = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || draftPointsRef.current.length < 3) return;

    const points = [...draftPointsRef.current];
    stopDrawing();
    mountPolygon(map, points);
    onPolygonChangeRef.current(latLngsToGeoJson(points));
    setHasPolygon(true);
  }, [mountPolygon, stopDrawing]);

  finishDrawingRef.current = finishDrawing;

  const addDraftPoint = useCallback(
    (point: google.maps.LatLngLiteral) => {
      const map = mapInstanceRef.current;
      if (!map || mapToolRef.current !== 'draw' || !isDrawingRef.current) return;

      const points = draftPointsRef.current;
      if (points.length >= 3) {
        const first = points[0];
        if (distanceMeters(point, first) <= CLOSE_SNAP_METERS) {
          finishDrawing();
          return;
        }
      }

      draftPointsRef.current = [...points, point];
      setDraftCount(draftPointsRef.current.length);
      rubberBandRef.current?.setMap(null);
      rubberBandRef.current = null;
      refreshDraftVisuals(map);
    },
    [finishDrawing, refreshDraftVisuals],
  );

  addDraftPointRef.current = addDraftPoint;

  const insertPointAtSegment = useCallback(
    (segmentIndex: number) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const points = draftPointsRef.current;
      const a = points[segmentIndex];
      const b = points[segmentIndex + 1];
      if (!a || !b) return;

      const next = [...points];
      next.splice(segmentIndex + 1, 0, midpoint(a, b));
      draftPointsRef.current = next;
      setDraftCount(next.length);
      refreshDraftVisuals(map);
    },
    [refreshDraftVisuals],
  );

  insertPointAtSegmentRef.current = insertPointAtSegment;

  const enterDrawMode = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      setLoadError('El mapa aún no está listo. Espera un momento e inténtalo de nuevo.');
      return;
    }

    setLoadError(null);

    if (!isDrawingRef.current) {
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
      clearPathListeners();
      clearDraftVisuals();
      draftPointsRef.current = [];
      setDraftCount(0);
      setCanClose(false);
      setHasPolygon(false);

      if (polygon?.coordinates?.[0]?.length) {
        onPolygonChangeRef.current(null);
      }

      if (anchorMarkerRef.current) {
        anchorMarkerRef.current.map = null;
        anchorMarkerRef.current = null;
      }

      isDrawingRef.current = true;
      setIsDrawing(true);
    }

    mapToolRef.current = 'draw';
    setMapTool('draw');
    applyMapInteractionMode(map, 'draw');
    attachDrawingListeners(map);
  }, [attachDrawingListeners, clearDraftVisuals, clearPathListeners, polygon]);

  const enterDrawModeRef = useRef(enterDrawMode);
  enterDrawModeRef.current = enterDrawMode;

  const hasPolygonRef = useRef(hasPolygon);
  hasPolygonRef.current = hasPolygon;

  const triggerMapResize = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    window.setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
    }, 120);
  }, []);

  const toggleMapFullscreen = useCallback(async () => {
    const frame = mapFrameRef.current;
    if (!frame) return;

    const nativeActive = isMapFrameFullscreen(frame);

    if (nativeActive || isMapExpanded) {
      if (nativeActive) {
        await exitDocumentFullscreen();
      }
      setIsMapExpanded(false);
      setIsMapMaximized(false);
      triggerMapResize();
      return;
    }

    if (!hasPolygonRef.current) {
      enterDrawModeRef.current();
    }

    try {
      await requestElementFullscreen(frame);
      setIsMapMaximized(true);
      triggerMapResize();
    } catch {
      setIsMapExpanded(true);
      setIsMapMaximized(true);
      if (!hasPolygonRef.current) {
        enterDrawModeRef.current();
      }
      triggerMapResize();
    }
  }, [isMapExpanded, triggerMapResize]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const native = isMapFrameFullscreen(mapFrameRef.current);
      if (native) {
        setIsMapMaximized(true);
        if (!hasPolygonRef.current) {
          enterDrawModeRef.current();
        }
      } else if (!isMapExpanded) {
        setIsMapMaximized(false);
      }
      triggerMapResize();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isMapExpanded) return;
      setIsMapExpanded(false);
      setIsMapMaximized(false);
      triggerMapResize();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMapExpanded, triggerMapResize]);

  const handleDrawPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (mapToolRef.current !== 'draw' || !isDrawingRef.current) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleDrawPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (mapToolRef.current !== 'draw' || !isDrawingRef.current) return;
      if (draftPointsRef.current.length === 0) return;
      updateRubberBand(event.clientX, event.clientY);
    },
    [updateRubberBand],
  );

  const handleDrawPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (mapToolRef.current !== 'draw' || !isDrawingRef.current) return;

      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > TAP_MOVE_THRESHOLD_PX) return;

      event.preventDefault();
      event.stopPropagation();

      const projection = projectionHelperRef.current;
      const mapEl = mapRef.current;
      if (!projection || !mapEl) return;

      const rect = mapEl.getBoundingClientRect();
      const point = projection.containerPixelToLatLng(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      if (!point) return;

      addDraftPoint(point);
    },
    [addDraftPoint],
  );

  const handleDrawClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mapToolRef.current !== 'draw' || !isDrawingRef.current) return;
      event.preventDefault();
      event.stopPropagation();

      const projection = projectionHelperRef.current;
      const mapEl = mapRef.current;
      if (!projection || !mapEl) return;

      const rect = mapEl.getBoundingClientRect();
      const point = projection.containerPixelToLatLng(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      if (!point) return;

      addDraftPoint(point);
    },
    [addDraftPoint],
  );

  const undoLastPoint = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || draftPointsRef.current.length === 0) return;

    draftPointsRef.current = draftPointsRef.current.slice(0, -1);
    setDraftCount(draftPointsRef.current.length);
    refreshDraftVisuals(map);
  }, [refreshDraftVisuals]);

  const handlePlaceSelected = useCallback(
    (place: { address: string; latitude: number; longitude: number; placeId: string | null }) => {
      onSearchPlaceChange({
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      panToCenter(place.latitude, place.longitude);
      if (!hasPolygon) {
        enterDrawMode();
      }
    },
    [enterDrawMode, hasPolygon, onSearchPlaceChange, panToCenter],
  );

  useEffect(() => {
    if (!ready || centerLat == null || centerLng == null) return;
    panToCenter(centerLat, centerLng);
  }, [centerLat, centerLng, panToCenter, ready]);

  useEffect(() => {
    let cancelled = false;
    const initialPolygon = polygon;
    const initialCenterLat = centerLat;
    const initialCenterLng = centerLng;

    void loadGoogleMaps()
      .then(async () => {
        if (cancelled || !mapRef.current) return;

        const { AdvancedMarkerElement } = (await google.maps.importLibrary(
          'marker',
        )) as google.maps.MarkerLibrary;
        advancedMarkerClassRef.current = AdvancedMarkerElement;

        const initialCenter =
          initialCenterLat != null && initialCenterLng != null
            ? { lat: initialCenterLat, lng: initialCenterLng }
            : DEFAULT_CENTER;

        const map = new google.maps.Map(mapRef.current, {
          center: initialCenter,
          zoom: initialCenterLat != null && initialCenterLng != null ? SEARCH_ZOOM : 11,
          mapId: getGoogleMapsMapId(),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });
        mapInstanceRef.current = map;
        projectionHelperRef.current = attachMapProjectionHelper(map);
        void projectionHelperRef.current.ready;

        if (initialCenterLat != null && initialCenterLng != null) {
          panToCenter(initialCenterLat, initialCenterLng);
        }

        if (initialPolygon?.coordinates?.[0]?.length) {
          const ring = initialPolygon.coordinates[0]
            .filter((_, index, arr) => {
              if (index !== arr.length - 1) return true;
              const first = arr[0];
              const last = arr[index];
              return first[0] !== last[0] || first[1] !== last[1];
            })
            .map(([lng, lat]) => ({ lat, lng }));

          if (ring.length >= 3) {
            mountPolygon(map, ring);
            const bounds = new google.maps.LatLngBounds();
            ring.forEach((point) => bounds.extend(point));
            map.fitBounds(bounds);
          }
        }

        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setLoadError('No se pudo cargar el mapa. Revisa tu conexión y la API key de Google Maps.');
        }
      });

    return () => {
      cancelled = true;
      detachDrawingListeners();
      clearDraftVisuals();
      clearPathListeners();
      polygonRef.current?.setMap(null);
      if (anchorMarkerRef.current) anchorMarkerRef.current.map = null;
      projectionHelperRef.current?.detach();
      projectionHelperRef.current = null;
      mapInstanceRef.current = null;
      isDrawingRef.current = false;
    };
    // Map initializes once; callbacks use refs to avoid remount loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasSearchAnchor = Boolean(searchAddress.trim());
  const drawToolActive = isDrawing && mapTool === 'draw';

  const drawHint = (() => {
    if (!isDrawing) {
      if (hasPolygon) return 'Arrastra los vértices del cerco para ajustar el área.';
      if (isMapMaximized) {
        return 'Pantalla completa activa: toca el mapa para colocar vértices. Usa la barra superior izquierda para las herramientas.';
      }
      return 'Pulsa «Comenzar a dibujar» o el icono de lápiz. Luego toca el mapa para colocar vértices.';
    }
    if (mapTool === 'pan') {
      return 'Mueve el mapa con un dedo. Pulsa el lápiz (activo en azul) para seguir dibujando.';
    }
    if (draftCount === 0) {
      return 'Modo lápiz activo: toca el mapa para colocar el primer vértice.';
    }
    if (draftCount < 3) {
      return `Añade ${3 - draftCount} vértice${3 - draftCount === 1 ? '' : 's'} más. Arrastra los puntos grises para curvar un segmento.`;
    }
    return 'Clic en el primer vértice (borde verde) para cerrar, o usa «Cerrar cerco».';
  })();

  return (
    <div className={styles.wrap}>
      <section className={styles.stepCard} aria-labelledby="zone-search-heading">
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>1</span>
          <div>
            <h2 id="zone-search-heading" className={styles.stepTitle}>
              Ubica tu zona
            </h2>
            <p className={styles.stepHint}>Busca la ciudad o colonia donde operas.</p>
          </div>
        </div>
        <ZonePlaceSearch onPlaceSelected={handlePlaceSelected} disabled={!ready} />
        {hasSearchAnchor ? (
          <div className={styles.locationReadout} aria-live="polite">
            <MyLocationOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            <span>{searchAddress}</span>
          </div>
        ) : null}
      </section>

      <section className={styles.stepCard} aria-labelledby="zone-draw-heading">
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>2</span>
          <div>
            <h2 id="zone-draw-heading" className={styles.stepTitle}>
              Dibuja el cerco
            </h2>
            <p className={styles.stepHint}>
              Estilo Google My Maps: usa pantalla completa (esquina superior derecha) para más espacio,
              activa el lápiz y cierra en el primer punto.
            </p>
          </div>
        </div>

        <div
          className={`${styles.instructionBar} ${drawToolActive ? styles.instructionBarActive : ''}`.trim()}
          role="status"
          aria-live="polite"
        >
          <TouchAppOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
          <span>{drawHint}</span>
        </div>

        {!hasPolygon && !isDrawing ? (
          <div className={styles.fullscreenTip} role="note">
            <FullscreenOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            <span>
              <strong>Recomendado:</strong> pulsa el botón de pantalla completa{' '}
              <span className={styles.fullscreenIconHint} aria-hidden>
                ⛶
              </span>{' '}
              en la esquina superior derecha del mapa (mismo lugar que Google Maps). Se activará el
              modo dibujo automáticamente y tendrás más espacio para marcar tu zona.
            </span>
          </div>
        ) : null}

        <div className={styles.mapShell}>
          <div
            ref={mapFrameRef}
            className={`${styles.mapFrame} ${drawToolActive ? styles.mapFrameDrawActive : ''} ${isMapMaximized ? styles.mapFrameMaximized : ''} ${isMapExpanded ? styles.mapFrameExpanded : ''}`.trim()}
          >
            <button
              type="button"
              className={styles.fullscreenBtn}
              disabled={!ready}
              title={isMapMaximized ? 'Salir de pantalla completa' : 'Pantalla completa para dibujar'}
              aria-label={isMapMaximized ? 'Salir de pantalla completa' : 'Pantalla completa para dibujar'}
              onClick={() => {
                void toggleMapFullscreen();
              }}
            >
              {isMapMaximized ? (
                <FullscreenExitOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
              ) : (
                <FullscreenOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
              )}
            </button>

            <div
              ref={mapRef}
              className={`${styles.map} ${drawToolActive ? styles.mapDrawing : ''}`.trim()}
              role="application"
              aria-label="Mapa para dibujar cerco de servicio"
              data-ready={ready ? 'true' : 'false'}
            />

            {drawToolActive ? (
              <div
                className={styles.drawCaptureLayer}
                role="presentation"
                aria-hidden
                onPointerDown={handleDrawPointerDown}
                onPointerMove={handleDrawPointerMove}
                onPointerUp={handleDrawPointerUp}
                onClick={handleDrawClick}
                onPointerCancel={() => {
                  pointerStartRef.current = null;
                }}
              />
            ) : null}

            {!hasPolygon ? (
              <div
                className={styles.floatingToolbar}
                role="toolbar"
                aria-label="Herramientas de dibujo del cerco"
              >
                <div className={styles.mapToolGroup} role="group" aria-label="Herramientas del mapa">
                  <button
                    type="button"
                    className={`${styles.mapToolBtn} ${mapTool === 'pan' && isDrawing ? styles.mapToolBtnActive : ''}`.trim()}
                    aria-pressed={mapTool === 'pan' && isDrawing}
                    title="Mover mapa"
                    disabled={!ready}
                    onClick={() => {
                      const map = mapInstanceRef.current;
                      if (!isDrawing) {
                        mapToolRef.current = 'pan';
                        setMapTool('pan');
                        if (map) applyMapInteractionMode(map, 'navigate');
                        return;
                      }
                      applyDrawingTool('pan');
                    }}
                  >
                    <PanToolAltOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
                    <span className={styles.srOnly}>Mover mapa</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.mapToolBtn} ${drawToolActive ? styles.mapToolBtnDrawActive : ''}`.trim()}
                    aria-pressed={drawToolActive}
                    title="Dibujar línea"
                    disabled={!ready}
                    onClick={enterDrawMode}
                  >
                    <DrawOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
                    <span className={styles.srOnly}>Dibujar línea</span>
                  </button>
                </div>

                {!isDrawing ? (
                  <button
                    type="button"
                    className={styles.toolBtnPrimary}
                    disabled={!ready}
                    onClick={enterDrawMode}
                  >
                    Comenzar a dibujar
                  </button>
                ) : (
                  <>
                    <span className={styles.draftBadge} role="status">
                      {draftCount} vértice{draftCount === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className={styles.toolBtn}
                      disabled={draftCount === 0}
                      onClick={undoLastPoint}
                    >
                      Deshacer
                    </button>
                    <button
                      type="button"
                      className={styles.toolBtnCta}
                      disabled={!canClose}
                      onClick={finishDrawing}
                    >
                      Cerrar cerco
                    </button>
                    <button type="button" className={styles.toolBtn} onClick={stopDrawing}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {hasPolygon && !isDrawing ? (
              <div className={styles.floatingToolbar} role="toolbar">
                <button type="button" className={styles.toolBtn} onClick={clearPolygon}>
                  Borrar y redibujar
                </button>
              </div>
            ) : null}
          </div>

          {loadError ? (
            <p className={styles.error} role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
