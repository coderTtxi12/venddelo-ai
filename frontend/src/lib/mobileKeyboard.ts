function blurElement(element: Element | null | undefined): void {
  if (element instanceof HTMLElement) {
    element.blur();
  }
}

/** Dismiss the on-screen keyboard by blurring focused inputs. */
export function dismissMobileKeyboard(root?: HTMLElement | null): void {
  if (typeof window === 'undefined') return;

  blurElement(document.activeElement);

  if (!root) return;

  blurElement(root.querySelector('input'));
  blurElement(root.querySelector('textarea'));

  const placeAutocomplete = root.querySelector('gmp-place-autocomplete');
  if (placeAutocomplete?.shadowRoot) {
    blurElement(placeAutocomplete.shadowRoot.querySelector('input'));
  }
}

/** Scroll content into view after the virtual keyboard closes. */
export function scrollElementIntoViewAfterKeyboard(
  element: HTMLElement | null | undefined,
): void {
  if (!element || typeof window === 'undefined') return;

  const scroll = () => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (!window.visualViewport) {
    window.setTimeout(scroll, 120);
    return;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.visualViewport?.removeEventListener('resize', onResize);
    scroll();
  };

  const onResize = () => {
    window.setTimeout(finish, 60);
  };

  window.visualViewport.addEventListener('resize', onResize);
  window.setTimeout(finish, 400);
}
