import type { DragEvent as ReactDragEvent } from 'react';

const EMPTY_DRAG_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

type DragOverlayOptions = {
  offsetX?: number;
  offsetY?: number;
  overlayClassName?: string;
  bodyDraggingClassName?: string;
};

export function attachDragOverlay(
  event: ReactDragEvent<HTMLElement>,
  sourceElement: HTMLElement,
  options: DragOverlayOptions = {},
): void {
  const { offsetX = 28, offsetY = 32, overlayClassName, bodyDraggingClassName } = options;
  const rect = sourceElement.getBoundingClientRect();
  const clone = sourceElement.cloneNode(true) as HTMLElement;

  clone.setAttribute('aria-hidden', 'true');
  clone.style.position = 'fixed';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '10000';
  clone.style.opacity = '0.98';
  clone.style.transform = 'rotate(-0.75deg) scale(1.025)';
  clone.style.boxShadow =
    '0 24px 52px rgba(15, 23, 42, 0.22), 0 10px 20px rgba(79, 70, 229, 0.12)';
  clone.style.transition = 'box-shadow 0.15s ease';

  if (overlayClassName) {
    clone.classList.add(overlayClassName);
  }

  document.body.appendChild(clone);

  const img = new Image();
  img.src = EMPTY_DRAG_IMAGE;
  event.dataTransfer.setDragImage(img, 0, 0);

  const moveOverlay = (ev: globalThis.DragEvent) => {
    if (ev.clientX === 0 && ev.clientY === 0) return;
    clone.style.left = `${ev.clientX - offsetX}px`;
    clone.style.top = `${ev.clientY - offsetY}px`;
  };

  const cleanup = () => {
    document.removeEventListener('drag', moveOverlay);
    clone.remove();
    if (bodyDraggingClassName) {
      document.body.classList.remove(bodyDraggingClassName);
    }
  };

  if (bodyDraggingClassName) {
    document.body.classList.add(bodyDraggingClassName);
  }

  document.addEventListener('drag', moveOverlay);
  event.currentTarget.addEventListener('dragend', cleanup, { once: true });
}
