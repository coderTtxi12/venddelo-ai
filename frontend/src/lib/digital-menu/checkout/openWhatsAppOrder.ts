import { getPublicMenuViewportBand } from '@/lib/digital-menu/layout';
import { buildWhatsAppOrderUrl } from './formatWhatsAppOrderMessage';

export type WhatsAppWindow = {
  closed: boolean;
  location: { href: string };
  close: () => void;
  focus?: () => void;
};

export type WhatsAppNavigationHost = {
  innerWidth: number;
  location: { href: string };
  open: (url: string, target: string) => WhatsAppWindow | null;
};

export type WhatsAppNavigation = {
  assign: (url: string) => void;
  cancel: () => void;
};

export function beginWhatsAppNavigation(
  host: WhatsAppNavigationHost,
  url: string,
): WhatsAppNavigation {
  const sameTab = getPublicMenuViewportBand(host.innerWidth) === 'mobile';
  if (sameTab) {
    return {
      assign: (targetUrl) => {
        host.location.href = targetUrl;
      },
      cancel: () => {},
    };
  }

  const popup = host.open(url, '_blank');
  return {
    assign: () => {
      try {
        if (popup && !popup.closed) popup.focus?.();
      } catch {
        // Cross-origin WhatsApp tabs often revoke the handle; never navigate the menu tab.
      }
    },
    cancel: () => {
      try {
        popup?.close();
      } catch {
        // Ignore if the tab handle is already detached.
      }
    },
  };
}

function browserHost(): WhatsAppNavigationHost {
  return {
    innerWidth: window.innerWidth,
    location: window.location,
    open: (url, target) => window.open(url, target),
  };
}

/** Call synchronously in the tap, before any await. */
export function beginWhatsAppOrderNavigation(url: string): WhatsAppNavigation {
  return beginWhatsAppNavigation(browserHost(), url);
}

export function completeWhatsAppOrder(
  navigation: WhatsAppNavigation,
  phone: string,
  message: string,
): void {
  navigation.assign(buildWhatsAppOrderUrl(phone, message));
}
