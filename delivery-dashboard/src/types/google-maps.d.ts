export {};

declare global {
  namespace google.maps.places {
    class PlaceAutocompleteElement extends HTMLElement {
      constructor(options?: { includedRegionCodes?: string[] });
      className: string;
      addEventListener(
        type: 'gmp-select',
        listener: (event: PlacePredictionSelectEvent) => void,
      ): void;
    }

    interface PlacePredictionSelectEvent {
      placePrediction: PlacePrediction;
    }

    interface PlacePrediction {
      toPlace(): Place;
    }

    class Place {
      id?: string;
      formattedAddress?: string;
      location?: google.maps.LatLng;
      fetchFields(options: { fields: string[] }): Promise<void>;
    }
  }

  namespace google.maps.marker {
    interface AdvancedMarkerElementOptions {
      map?: google.maps.Map | null;
      position?: google.maps.LatLngLiteral | google.maps.LatLng;
      content?: HTMLElement;
      gmpDraggable?: boolean;
      gmpClickable?: boolean;
      title?: string;
      zIndex?: number;
    }

    class AdvancedMarkerElement {
      constructor(opts?: AdvancedMarkerElementOptions);
      map: google.maps.Map | null;
      position: google.maps.LatLngLiteral | google.maps.LatLng | null | undefined;
      addListener(
        eventName: 'click' | 'dragend',
        handler: () => void,
      ): google.maps.MapsEventListener;
    }
  }

  namespace google.maps {
    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    class LatLng {
      lat(): number;
      lng(): number;
    }

    class LatLngBounds {
      extend(point: LatLngLiteral | LatLng): void;
    }

    class Point {
      constructor(x: number, y: number);
      x: number;
      y: number;
    }

    class MapCanvasProjection {
      fromContainerPixelToLatLng(pixel: Point): LatLng;
    }

    class OverlayView {
      onAdd?: () => void;
      draw?: () => void;
      setMap(map: Map | null): void;
      getProjection(): MapCanvasProjection | null;
    }

    class MVCArray<T> {
      getLength(): number;
      getAt(index: number): T;
    }

    interface MapOptions {
      center?: LatLngLiteral | LatLng;
      zoom?: number;
      mapId?: string;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      draggableCursor?: string;
      draggable?: boolean;
      gestureHandling?: string;
      scrollwheel?: boolean;
      disableDoubleClickZoom?: boolean;
    }

    interface MapMouseEvent {
      latLng?: LatLng | null;
    }

    interface MapsEventListener {
      remove(): void;
    }

    interface PolygonOptions {
      paths?: LatLngLiteral[] | MVCArray<LatLng>;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeWeight?: number;
      editable?: boolean;
      draggable?: boolean;
      clickable?: boolean;
      map?: Map | null;
    }

    interface PolylineOptions {
      path?: LatLngLiteral[];
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      map?: Map | null;
      icons?: Array<{
        icon: { path: string; strokeOpacity?: number; scale?: number };
        offset?: string;
        repeat?: string;
      }>;
    }

    class Map {
      constructor(el: HTMLElement, opts?: MapOptions);
      fitBounds(bounds: LatLngBounds): void;
      panTo(center: LatLngLiteral | LatLng): void;
      setZoom(zoom: number): void;
      setOptions(options: MapOptions): void;
      addListener(
        eventName: 'click' | 'mousemove',
        handler: (event: MapMouseEvent) => void,
      ): MapsEventListener;
    }

    class Polygon {
      constructor(opts?: PolygonOptions);
      getPath(): MVCArray<LatLng>;
      setMap(map: Map | null): void;
    }

    class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
    }

    interface MarkerLibrary {
      AdvancedMarkerElement: typeof marker.AdvancedMarkerElement;
    }

    namespace event {
      function addListener(
        instance: object,
        eventName: string,
        handler: (...args: unknown[]) => void,
      ): MapsEventListener;
      function trigger(instance: object, eventName: string, ...args: unknown[]): void;
    }

    function importLibrary(name: 'maps'): Promise<{
      Map: typeof Map;
      LatLng: typeof LatLng;
      LatLngBounds: typeof LatLngBounds;
      Polygon: typeof Polygon;
      Polyline: typeof Polyline;
      Point: typeof Point;
      OverlayView: typeof OverlayView;
    }>;
    function importLibrary(name: 'marker'): Promise<MarkerLibrary>;
    function importLibrary(name: 'places'): Promise<{
      PlaceAutocompleteElement: typeof places.PlaceAutocompleteElement;
    }>;
    function importLibrary(name: string): Promise<unknown>;
  }

  const google: {
    maps: {
      importLibrary: typeof google.maps.importLibrary;
      Map: typeof google.maps.Map;
      LatLng: typeof google.maps.LatLng;
      LatLngBounds: typeof google.maps.LatLngBounds;
      Polygon: typeof google.maps.Polygon;
      Polyline: typeof google.maps.Polyline;
      Point: typeof google.maps.Point;
      OverlayView: typeof google.maps.OverlayView;
      marker: typeof google.maps.marker;
      event: typeof google.maps.event;
      places: typeof google.maps.places;
    };
  };

  interface Window {
    google?: typeof google;
  }
}
