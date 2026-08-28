export {};

declare global {
  namespace google.maps.places {
    class PlaceAutocompleteElement extends HTMLElement {
      constructor(options?: { includedRegionCodes?: string[]; noInputIcon?: boolean });
      className: string;
      placeholder: string;
      noInputIcon: boolean;
      value: string;
      appendChild<T extends Node>(node: T): T;
      querySelector(selectors: string): Element | null;
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

    interface AutocompleteOptions {
      componentRestrictions?: { country?: string | string[] };
      fields?: string[];
    }

    interface PlaceGeometry {
      location?: google.maps.LatLng;
    }

    interface AutocompletePlace {
      formatted_address?: string;
      geometry?: PlaceGeometry;
      place_id?: string;
    }

    class Autocomplete {
      constructor(inputField: HTMLInputElement, opts?: AutocompleteOptions);
      getPlace(): AutocompletePlace;
      addListener(
        eventName: 'place_changed',
        handler: () => void,
      ): google.maps.MapsEventListener;
    }
  }

  namespace google.maps.marker {
    interface AdvancedMarkerElementOptions {
      map?: google.maps.Map | null;
      position?: google.maps.LatLngLiteral | google.maps.LatLng;
      gmpDraggable?: boolean;
      gmpClickable?: boolean;
      title?: string;
      content?: HTMLElement;
      zIndex?: number;
    }

    class AdvancedMarkerElement {
      constructor(opts?: AdvancedMarkerElementOptions);
      map: google.maps.Map | null;
      position: google.maps.LatLngLiteral | google.maps.LatLng | null | undefined;
      addListener(eventName: 'dragend', handler: () => void): google.maps.MapsEventListener;
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

    interface MapOptions {
      center?: LatLngLiteral | LatLng;
      zoom?: number;
      mapId?: string;
      gestureHandling?: string;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      clickableIcons?: boolean;
    }

    class Map {
      constructor(el: HTMLElement, opts?: MapOptions);
      setCenter(center: LatLngLiteral | LatLng): void;
      setZoom(zoom: number): void;
      panTo(center: LatLngLiteral | LatLng): void;
      fitBounds(bounds: LatLngBounds, padding?: number): void;
      addListener(eventName: 'click', handler: (event: MapMouseEvent) => void): MapsEventListener;
    }

    enum TravelMode {
      DRIVING = 'DRIVING',
      WALKING = 'WALKING',
      BICYCLING = 'BICYCLING',
      TRANSIT = 'TRANSIT',
      TWO_WHEELER = 'TWO_WHEELER',
    }

    interface DirectionsRequest {
      origin: LatLngLiteral | LatLng | string;
      destination: LatLngLiteral | LatLng | string;
      travelMode: TravelMode | string;
    }

    interface DirectionsResult {
      routes: Array<{
        overview_path: LatLng[];
      }>;
    }

    class DirectionsService {
      route(request: DirectionsRequest): Promise<DirectionsResult>;
    }

    interface PolylineOptions {
      path?: LatLngLiteral[];
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      geodesic?: boolean;
      clickable?: boolean;
      zIndex?: number;
      map?: Map | null;
      icons?: Array<{
        icon: { path: string; strokeOpacity?: number; strokeColor?: string; scale?: number };
        offset?: string;
        repeat?: string;
      }>;
    }

    class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
    }

    interface MapMouseEvent {
      latLng?: LatLng | null;
      placeId?: string;
      stop(): void;
    }

    interface MapsEventListener {
      remove(): void;
    }

    interface MapsLibrary {
      Map: typeof Map;
    }

    interface MarkerLibrary {
      AdvancedMarkerElement: typeof marker.AdvancedMarkerElement;
    }

    function importLibrary(name: 'maps'): Promise<MapsLibrary>;
    function importLibrary(name: 'marker'): Promise<MarkerLibrary>;
    function importLibrary(name: 'places'): Promise<{
      PlaceAutocompleteElement: new (options?: {
        includedRegionCodes?: string[];
        noInputIcon?: boolean;
      }) => google.maps.places.PlaceAutocompleteElement;
      Place: new (options: { id: string }) => google.maps.places.Place;
      Autocomplete: typeof google.maps.places.Autocomplete;
    }>;
    function importLibrary(name: 'geocoding'): Promise<{
      Geocoder: new () => {
        geocode(request: { location: LatLngLiteral }): Promise<{
          results: Array<{ formatted_address?: string }>;
        }>;
      };
    }>;
    function importLibrary(name: string): Promise<unknown>;
  }

  const google: {
    maps: {
      importLibrary: typeof google.maps.importLibrary;
      LatLng: typeof google.maps.LatLng;
      LatLngBounds: typeof google.maps.LatLngBounds;
      Map: typeof google.maps.Map;
      Polyline: typeof google.maps.Polyline;
      DirectionsService: typeof google.maps.DirectionsService;
      TravelMode: typeof google.maps.TravelMode;
      marker: typeof google.maps.marker;
      places: typeof google.maps.places;
    };
  };

  interface Window {
    google?: typeof google;
  }
}
