'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import {
  clampImageZoomTransform,
  getTouchDistance,
  IMAGE_ZOOM_RESET,
  pointerToLocalPoint,
  toggleDoubleTapZoom,
  zoomAtPoint,
  type ImageZoomTransform,
} from '@/lib/digital-menu/productImageZoom';
import styles from './ProductImageLightbox.module.css';

type ProductImageLightboxProps = {
  open: boolean;
  imageUrl: string;
  imageAlt: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  themeStyle?: CSSProperties;
};

type PinchState = {
  initialDistance: number;
  initialScale: number;
  initialTransform: ImageZoomTransform;
  midpointX: number;
  midpointY: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
};

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE_PX = 32;
const WHEEL_ZOOM_FACTOR = 0.0018;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ProductImageLightbox({
  open,
  imageUrl,
  imageAlt,
  onClose,
  returnFocusRef,
  themeStyle,
}: ProductImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [transform, setTransform] = useState<ImageZoomTransform>(IMAGE_ZOOM_RESET);
  const [animating, setAnimating] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const transformRef = useRef<ImageZoomTransform>(IMAGE_ZOOM_RESET);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyTransform = useCallback(
    (next: ImageZoomTransform, options?: { animate?: boolean }) => {
      const viewport = viewportRef.current;
      const width = viewport?.clientWidth ?? 0;
      const height = viewport?.clientHeight ?? 0;
      const imageWidth = imageSize.width || imageRef.current?.naturalWidth || 0;
      const imageHeight = imageSize.height || imageRef.current?.naturalHeight || 0;
      const clamped = clampImageZoomTransform(next, width, height, imageWidth, imageHeight);

      if (options?.animate && !prefersReducedMotion()) {
        setAnimating(true);
        window.setTimeout(() => setAnimating(false), 220);
      }

      setTransform(clamped);
    },
    [imageSize.height, imageSize.width],
  );

  const resetTransform = useCallback(() => {
    pinchRef.current = null;
    panRef.current = null;
    lastTapRef.current = null;
    setAnimating(false);
    setTransform(IMAGE_ZOOM_RESET);
  }, []);

  const handleClose = useCallback(() => {
    resetTransform();
    onClose();
  }, [onClose, resetTransform]);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      resetTransform();
      return;
    }

    setVisible(true);
    resetTransform();

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef?.current?.focus();
    };
  }, [handleClose, open, resetTransform, returnFocusRef]);

  const getViewportRect = () => viewportRef.current?.getBoundingClientRect();

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (transformRef.current.scale === 1) {
      handleClose();
    }
  };

  const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && transformRef.current.scale === 1) {
      handleClose();
      return;
    }
    handlePointerDown(event);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = getViewportRect();
    if (!rect) return;

    const point = pointerToLocalPoint(event.clientX, event.clientY, rect);
    const delta = -event.deltaY * WHEEL_ZOOM_FACTOR;
    const nextScale = transform.scale * (1 + delta);
    applyTransform(zoomAtPoint(transform, nextScale, point.x, point.y));
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = getViewportRect();
    if (!rect) return;
    const point = pointerToLocalPoint(event.clientX, event.clientY, rect);
    applyTransform(toggleDoubleTapZoom(transformRef.current, point.x, point.y), { animate: true });
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const rect = getViewportRect();
      if (!rect) return;

      const [touchA, touchB] = [event.touches[0]!, event.touches[1]!];
      const midpoint = pointerToLocalPoint(
        (touchA.clientX + touchB.clientX) / 2,
        (touchA.clientY + touchB.clientY) / 2,
        rect,
      );

      pinchRef.current = {
        initialDistance: getTouchDistance(touchA, touchB),
        initialScale: transformRef.current.scale,
        initialTransform: transformRef.current,
        midpointX: midpoint.x,
        midpointY: midpoint.y,
      };
      panRef.current = null;
      lastTapRef.current = null;
      return;
    }

    if (event.touches.length === 1 && transformRef.current.scale > 1) {
      const touch = event.touches[0]!;
      panRef.current = {
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        initialX: transformRef.current.x,
        initialY: transformRef.current.y,
      };
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      const [touchA, touchB] = [event.touches[0]!, event.touches[1]!];
      const distance = getTouchDistance(touchA, touchB);
      if (pinchRef.current.initialDistance <= 0) return;

      const ratio = distance / pinchRef.current.initialDistance;
      const nextScale = pinchRef.current.initialScale * ratio;
      applyTransform(
        zoomAtPoint(
          pinchRef.current.initialTransform,
          nextScale,
          pinchRef.current.midpointX,
          pinchRef.current.midpointY,
        ),
      );
      return;
    }

    if (event.touches.length === 1 && panRef.current && transformRef.current.scale > 1) {
      const touch = event.touches[0]!;
      if (touch.identifier !== panRef.current.pointerId) return;
      event.preventDefault();

      const deltaX = touch.clientX - panRef.current.startX;
      const deltaY = touch.clientY - panRef.current.startY;
      applyTransform({
        scale: transformRef.current.scale,
        x: panRef.current.initialX + deltaX,
        y: panRef.current.initialY + deltaY,
      });
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
    if (event.touches.length === 0) {
      panRef.current = null;
    }

    if (event.changedTouches.length !== 1 || pinchRef.current) return;

    const touch = event.changedTouches[0]!;
    const now = Date.now();
    const lastTap = lastTapRef.current;

    if (
      lastTap &&
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE_PX
    ) {
      const rect = getViewportRect();
      if (!rect) return;
      const point = pointerToLocalPoint(touch.clientX, touch.clientY, rect);
      applyTransform(toggleDoubleTapZoom(transformRef.current, point.x, point.y), { animate: true });
      lastTapRef.current = null;
      return;
    }

    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (transformRef.current.scale <= 1) return;

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: transformRef.current.x,
      initialY: transformRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || transformRef.current.scale <= 1) return;

    applyTransform({
      scale: transformRef.current.scale,
      x: pan.initialX + (event.clientX - pan.startX),
      y: pan.initialY + (event.clientY - pan.startY),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={styles.overlay}
      style={themeStyle}
      data-entering={visible ? 'true' : undefined}
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        ref={viewportRef}
        className={styles.viewport}
        role="dialog"
        aria-modal="true"
        aria-label={imageAlt}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeBtn}
          aria-label="Cerrar imagen"
          onClick={handleClose}
        >
          <CloseIcon fontSize="small" />
        </button>

        <img
          ref={imageRef}
          src={imageUrl}
          alt={imageAlt}
          className={styles.image}
          data-animating={animating ? 'true' : undefined}
          draggable={false}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
          onLoad={(event) => {
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
            applyTransform(transform);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
