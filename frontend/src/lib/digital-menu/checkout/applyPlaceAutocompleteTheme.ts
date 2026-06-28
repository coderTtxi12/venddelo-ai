import {
  createPlaceClearIcon,
  createPlacePredictionIcon,
  installPlaceAutocompleteShadowThemePatch,
  observePlaceAutocompletePredictionIcons,
  syncPlaceAutocompletePredictionIcons,
} from './placeAutocompleteIcons';

const PREDICTION_ICON_CLASS = 'dm-place-prediction-icon';

/** Sync Google PlaceAutocompleteElement with live menu theme tokens. */
export function applyPlaceAutocompleteTheme(
  element: google.maps.places.PlaceAutocompleteElement,
  options?: { predictionIconClassName?: string; clearIconClassName?: string },
): () => void {
  installPlaceAutocompleteShadowThemePatch();

  element.style.setProperty('width', '100%');
  element.style.setProperty('background-color', 'transparent');
  element.style.setProperty('border', 'none');
  element.style.setProperty('outline', 'none');
  element.style.setProperty('box-shadow', 'none');
  element.style.setProperty('color-scheme', 'normal');
  element.style.setProperty('font-family', 'var(--dm-font-body, system-ui, sans-serif)');
  element.style.setProperty('font-size', '0.92rem');
  element.style.setProperty('color', 'var(--dm-text, #111827)');
  element.style.setProperty('--gmp-mat-color-primary', 'var(--dm-primary, #111827)');
  element.style.setProperty(
    '--gmp-mat-color-outline-decorative',
    'var(--dm-border, #e2e8f0)',
  );
  element.style.setProperty('--gmp-mat-color-surface', 'var(--dm-surface, #fff)');
  element.style.setProperty('--gmp-mat-color-on-surface', 'var(--dm-text, #111827)');
  element.style.setProperty(
    '--gmp-mat-color-on-surface-variant',
    'var(--dm-text-secondary, #64748b)',
  );
  element.style.setProperty('--gmp-mat-color-info', 'var(--dm-primary, #111827)');
  element.style.setProperty(
    '--gmp-mat-color-neutral-container',
    'color-mix(in srgb, var(--dm-primary, #111827) 12%, var(--dm-surface, #fff))',
  );
  element.style.setProperty(
    '--gmp-mat-color-on-neutral-container',
    'var(--dm-primary, #111827)',
  );

  element.noInputIcon = true;

  const iconClass = options?.predictionIconClassName ?? PREDICTION_ICON_CLASS;
  const existingIcon = element.querySelector('svg[slot="prediction-item-icon"]');
  if (!existingIcon) {
    element.appendChild(createPlacePredictionIcon(iconClass));
  }

  const clearIconClass = options?.clearIconClassName ?? 'dm-place-clear-icon';
  const existingClearIcon = element.querySelector('svg[slot="clear-icon"]');
  if (!existingClearIcon) {
    element.appendChild(createPlaceClearIcon(clearIconClass));
  }

  const host = element as unknown as HTMLElement;
  const stopObservingIcons = observePlaceAutocompletePredictionIcons(host);

  const handleInput = () => {
    syncPlaceAutocompletePredictionIcons(host);
  };
  host.addEventListener('input', handleInput);

  return () => {
    stopObservingIcons();
    host.removeEventListener('input', handleInput);
  };
}

export { PREDICTION_ICON_CLASS };
