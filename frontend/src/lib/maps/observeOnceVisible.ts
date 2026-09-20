const DEFAULT_ROOT_MARGIN = '120px 0px';

type ObserveOnceVisibleOptions = {
  rootMargin?: string;
};

export function observeOnceVisible(
  element: Element,
  onVisible: () => void,
  options: ObserveOnceVisibleOptions = {},
): () => void {
  if (typeof IntersectionObserver !== 'function') {
    onVisible();
    return () => undefined;
  }

  let fired = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (fired || !entries.some((entry) => entry.isIntersecting)) return;
      fired = true;
      observer.disconnect();
      onVisible();
    },
    { rootMargin: options.rootMargin ?? DEFAULT_ROOT_MARGIN },
  );

  observer.observe(element);
  return () => observer.disconnect();
}
