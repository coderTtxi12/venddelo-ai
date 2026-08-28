export type PlaceAutocompleteValueHost = {
  value?: string;
  shadowRoot?: {
    querySelector(selectors: string): { value?: string } | null;
  } | null;
};

/** Fill the Places search box with a formatted address (GPS / pin / saved). */
export function writePlaceAutocompleteValue(
  element: PlaceAutocompleteValueHost | null | undefined,
  address: string,
): void {
  if (!element) return;
  const next = address.trim();
  if (!next) return;

  element.value = next;

  const input = element.shadowRoot?.querySelector('input');
  if (input && input.value !== next) {
    input.value = next;
  }
}
