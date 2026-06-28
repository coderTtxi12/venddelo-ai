const PIN_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

const CLEAR_PATH =
  'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z';

const SHADOW_ICON_STYLES = `
  .place-autocomplete-element-place-icon svg path,
  [class*="place-icon"] svg path,
  [class*="place-result"] svg path,
  li svg path {
    fill: var(--dm-primary, #111827) !important;
  }

  .place-autocomplete-element-place-icon svg,
  [class*="place-icon"] svg,
  [class*="place-result"] svg,
  li svg {
    color: var(--dm-primary, #111827) !important;
  }

  svg[slot="prediction-item-icon"] path,
  svg[slot="prediction-item-icon"] {
    fill: var(--dm-primary, #111827) !important;
    color: var(--dm-primary, #111827) !important;
  }

  .clear-button,
  [class*="clear-button"] {
    color: var(--dm-text-secondary, #64748b) !important;
    background: transparent !important;
    border: none !important;
    opacity: 1 !important;
  }

  .clear-button svg path,
  [class*="clear-button"] svg path,
  svg[slot="clear-icon"] path,
  svg[slot="clear-icon"] {
    fill: var(--dm-text-secondary, #64748b) !important;
  }

  .clear-button svg,
  [class*="clear-button"] svg,
  svg[slot="clear-icon"] {
    color: var(--dm-text-secondary, #64748b) !important;
  }

  .clear-button:hover svg path,
  [class*="clear-button"]:hover svg path {
    fill: var(--dm-primary, #111827) !important;
  }
`;

/** Slotted clear icon — replaces Google's default dark X on dark themes. */
export function createPlaceClearIcon(className: string): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('slot', 'clear-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.style.color = 'var(--dm-text-secondary, #64748b)';
  icon.style.fill = 'var(--dm-text-secondary, #64748b)';
  if (className) icon.setAttribute('class', className);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CLEAR_PATH);
  path.setAttribute('fill', 'var(--dm-text-secondary, #64748b)');
  icon.appendChild(path);

  return icon;
}

/** One slotted SVG — Google clones it for each suggestion row. */
export function createPlacePredictionIcon(className: string): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('slot', 'prediction-item-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.style.color = 'var(--dm-primary, #111827)';
  icon.style.fill = 'var(--dm-primary, #111827)';
  if (className) icon.setAttribute('class', className);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PIN_PATH);
  path.setAttribute('fill', 'var(--dm-primary, #111827)');
  icon.appendChild(path);

  return icon;
}

let shadowThemePatchInstalled = false;

/**
 * Google uses a closed shadow root with hard-coded icon fills on SVG paths.
 * Patch attachShadow once so we can inject theme-aware icon styles.
 */
export function installPlaceAutocompleteShadowThemePatch(): void {
  if (shadowThemePatchInstalled || typeof document === 'undefined') return;
  shadowThemePatchInstalled = true;

  const prototype = Element.prototype as Element & {
    attachShadow: (init: ShadowRootInit) => ShadowRoot;
  };
  const originalAttachShadow = prototype.attachShadow;

  prototype.attachShadow = function attachShadowPatched(init: ShadowRootInit) {
    const shadow = originalAttachShadow.call(this, { ...init, mode: 'open' });
    if (this instanceof HTMLElement && this.localName === 'gmp-place-autocomplete') {
      const style = document.createElement('style');
      style.textContent = SHADOW_ICON_STYLES;
      shadow.appendChild(style);
    }
    return shadow;
  };
}

function readThemeColor(element: HTMLElement, token: '--dm-primary' | '--dm-text-secondary'): string {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  if (value) return value;
  if (token === '--dm-primary') {
    return getComputedStyle(element).getPropertyValue('--gmp-mat-color-primary').trim() || '#111827';
  }
  return '#64748b';
}

/** Force widget icons to use live-menu theme tokens. */
export function syncPlaceAutocompletePredictionIcons(element: HTMLElement): void {
  const primary = readThemeColor(element, '--dm-primary');
  const secondary = readThemeColor(element, '--dm-text-secondary');

  element.querySelectorAll('svg[slot="prediction-item-icon"] path').forEach((node) => {
    if (node instanceof SVGElement) {
      node.style.setProperty('fill', primary, 'important');
    }
  });

  element.querySelectorAll('svg[slot="clear-icon"] path').forEach((node) => {
    if (node instanceof SVGElement) {
      node.style.setProperty('fill', secondary, 'important');
    }
  });

  const shadow = element.shadowRoot;
  if (!shadow) return;

  shadow.querySelectorAll('.place-autocomplete-element-place-icon svg path').forEach((node) => {
    if (node instanceof SVGElement) {
      node.style.setProperty('fill', primary, 'important');
    }
  });

  shadow.querySelectorAll('.clear-button svg path, [class*="clear-button"] svg path').forEach((node) => {
    if (node instanceof SVGElement) {
      node.style.setProperty('fill', secondary, 'important');
    }
  });
}

export function observePlaceAutocompletePredictionIcons(element: HTMLElement): () => void {
  syncPlaceAutocompletePredictionIcons(element);

  const shadow = element.shadowRoot;
  if (!shadow) {
    return () => undefined;
  }

  const observer = new MutationObserver(() => {
    syncPlaceAutocompletePredictionIcons(element);
  });

  observer.observe(shadow, { childList: true, subtree: true });

  return () => observer.disconnect();
}
