export {};

declare global {
  namespace google.maps.places {
    class PlaceAutocompleteElement extends HTMLElement {
      constructor(options?: { includedRegionCodes?: string[] });
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
      gmpDraggable?: boolean;
      title?: string;
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
      addListener(eventName: 'click', handler: (event: MapMouseEvent) => void): MapsEventListener;
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
      }) => google.maps.places.PlaceAutocompleteElement;
      Place: new (options: { id: string }) => google.maps.places.Place;
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
      Map: typeof google.maps.Map;
      marker: typeof google.maps.marker;
      places: typeof google.maps.places;
    };
  };

  interface Window {
    google?: typeof google;
  }
}
