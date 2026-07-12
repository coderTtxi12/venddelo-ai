import { restaurantPublicMenuUrl } from '@/lib/restaurantSubdomain';

export type DigitalMenuShareMethod = 'whatsapp' | 'native' | 'clipboard';

export type DigitalMenuSharePayload = {
  restaurantName: string;
  menuUrl: string;
};

export function buildDigitalMenuShareMessage(
  restaurantName: string,
  menuUrl: string,
): string {
  const name = restaurantName.trim() || 'este restaurante';
  return `Mira el menú de ${name}:\n${menuUrl}`;
}

/** Mobile / touch-primary contexts prioritize WhatsApp over the native share sheet. */
export function shouldPrioritizeWhatsAppShare(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(max-width: 900px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

function openWhatsAppShare(message: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyShareMessage(message: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = message;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export async function shareDigitalMenu(
  payload: DigitalMenuSharePayload,
): Promise<DigitalMenuShareMethod> {
  const menuUrl = payload.menuUrl.trim();
  if (!menuUrl) {
    throw new Error('Missing menu URL');
  }

  const message = buildDigitalMenuShareMessage(payload.restaurantName, menuUrl);

  if (shouldPrioritizeWhatsAppShare()) {
    openWhatsAppShare(message);
    return 'whatsapp';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: payload.restaurantName.trim() || 'Menú digital',
        text: message,
        url: menuUrl,
      });
      return 'native';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
    }
  }

  await copyShareMessage(message);
  return 'clipboard';
}

export function resolveDigitalMenuShareUrl(
  menuUrl: string | null | undefined,
  fallbackSubdomain?: string,
): string {
  const trimmed = menuUrl?.trim();
  if (trimmed) return trimmed;
  if (typeof window !== 'undefined') return window.location.href;
  if (fallbackSubdomain) return restaurantPublicMenuUrl(fallbackSubdomain);
  return '';
}
