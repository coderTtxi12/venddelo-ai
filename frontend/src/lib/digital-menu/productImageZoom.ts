export const IMAGE_LIGHTBOX_MIN_SCALE = 1;
export const IMAGE_LIGHTBOX_MAX_SCALE = 4;
export const IMAGE_LIGHTBOX_DOUBLE_TAP_SCALE = 2.5;

export type ImageZoomTransform = {
  scale: number;
  x: number;
  y: number;
};

export const IMAGE_ZOOM_RESET: ImageZoomTransform = { scale: 1, x: 0, y: 0 };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampImageZoomTransform(
  transform: ImageZoomTransform,
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): ImageZoomTransform {
  const scale = clamp(transform.scale, IMAGE_LIGHTBOX_MIN_SCALE, IMAGE_LIGHTBOX_MAX_SCALE);
  if (
    scale <= 1 ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return { scale, x: 0, y: 0 };
  }

  const fitScale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const displayWidth = imageWidth * fitScale * scale;
  const displayHeight = imageHeight * fitScale * scale;
  const maxX = Math.max(0, (displayWidth - containerWidth) / 2);
  const maxY = Math.max(0, (displayHeight - containerHeight) / 2);

  return {
    scale,
    x: clamp(transform.x, -maxX, maxX),
    y: clamp(transform.y, -maxY, maxY),
  };
}

export function zoomAtPoint(
  transform: ImageZoomTransform,
  nextScale: number,
  pointX: number,
  pointY: number,
): ImageZoomTransform {
  const scale = clamp(nextScale, IMAGE_LIGHTBOX_MIN_SCALE, IMAGE_LIGHTBOX_MAX_SCALE);
  if (scale === transform.scale) return transform;

  const ratio = scale / transform.scale;
  return {
    scale,
    x: pointX - ratio * (pointX - transform.x),
    y: pointY - ratio * (pointY - transform.y),
  };
}

export function toggleDoubleTapZoom(
  transform: ImageZoomTransform,
  pointX: number,
  pointY: number,
): ImageZoomTransform {
  if (transform.scale > 1) {
    return IMAGE_ZOOM_RESET;
  }
  return zoomAtPoint(transform, IMAGE_LIGHTBOX_DOUBLE_TAP_SCALE, pointX, pointY);
}

export function getTouchDistance(
  touchA: { clientX: number; clientY: number },
  touchB: { clientX: number; clientY: number },
): number {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.hypot(dx, dy);
}

export function pointerToLocalPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): { x: number; y: number } {
  return {
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2,
  };
}
