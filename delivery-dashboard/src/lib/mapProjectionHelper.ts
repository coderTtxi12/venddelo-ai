type MapProjectionHelper = {
  ready: Promise<void>;
  containerPixelToLatLng(x: number, y: number): google.maps.LatLngLiteral | null;
  detach: () => void;
};

export function attachMapProjectionHelper(map: google.maps.Map): MapProjectionHelper {
  let projection: google.maps.MapCanvasProjection | null = null;
  let readyResolved = false;

  const overlay = new google.maps.OverlayView();
  const ready = new Promise<void>((resolve) => {
    const resolveReady = () => {
      if (readyResolved) return;
      readyResolved = true;
      resolve();
    };

    overlay.onAdd = () => {
      const next = overlay.getProjection();
      if (next) {
        projection = next;
        resolveReady();
      }
    };
    overlay.draw = () => {
      const next = overlay.getProjection();
      if (!next) return;
      projection = next;
      resolveReady();
    };
    overlay.setMap(map);

    window.setTimeout(() => {
      if (!readyResolved) resolveReady();
    }, 1500);
  });

  return {
    ready,
    containerPixelToLatLng(x: number, y: number) {
      if (!projection) return null;
      const latLng = projection.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      return { lat: latLng.lat(), lng: latLng.lng() };
    },
    detach() {
      overlay.setMap(null);
      projection = null;
    },
  };
}
