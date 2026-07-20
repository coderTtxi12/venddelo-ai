export type PublicRestaurantSocialLinks = {
  facebook_url: string | null;
  instagram_url: string | null;
  whatsapp_url: string | null;
};

export type LiveMenuSocialPlacement = 'footer' | 'intro' | 'cover' | 'before_menu';

export const LIVE_MENU_SOCIAL_PLACEMENTS: LiveMenuSocialPlacement[] = [
  'footer',
  'intro',
  'cover',
  'before_menu',
];

export const DEFAULT_LIVE_MENU_SOCIAL_PLACEMENT: LiveMenuSocialPlacement = 'footer';

export const LIVE_MENU_SOCIAL_PLACEMENT_OPTIONS: {
  value: LiveMenuSocialPlacement;
  label: string;
  hint: string;
}[] = [
  {
    value: 'footer',
    label: 'Al final del menú',
    hint: 'Después de horarios y ubicación',
  },
  {
    value: 'intro',
    label: 'Debajo del encabezado',
    hint: 'Iconos compactos bajo el nombre y servicios',
  },
  {
    value: 'cover',
    label: 'Sobre la portada',
    hint: 'Flotando sobre la imagen de portada',
  },
  {
    value: 'before_menu',
    label: 'Antes de categorías',
    hint: 'Franja entre el encabezado y el menú',
  },
];

export type RestaurantSocialLinkSource = {
  live_menu_social_enabled: boolean;
  live_menu_social_facebook_enabled: boolean;
  live_menu_social_instagram_enabled: boolean;
  live_menu_social_whatsapp_enabled: boolean;
  live_menu_social_placement?: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  whatsapp_phone: string | null;
};

function normalizeSocialUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function whatsappContactUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

export function normalizeLiveMenuSocialPlacement(
  value: string | null | undefined,
): LiveMenuSocialPlacement {
  if (value && LIVE_MENU_SOCIAL_PLACEMENTS.includes(value as LiveMenuSocialPlacement)) {
    return value as LiveMenuSocialPlacement;
  }
  return DEFAULT_LIVE_MENU_SOCIAL_PLACEMENT;
}

export function buildRestaurantSocialLinks(
  source: RestaurantSocialLinkSource,
): PublicRestaurantSocialLinks | null {
  if (!source.live_menu_social_enabled) return null;

  const facebook_url =
    source.live_menu_social_facebook_enabled ? normalizeSocialUrl(source.facebook_url) : null;
  const instagram_url =
    source.live_menu_social_instagram_enabled ? normalizeSocialUrl(source.instagram_url) : null;
  const whatsapp_url =
    source.live_menu_social_whatsapp_enabled ? whatsappContactUrl(source.whatsapp_phone) : null;

  if (!facebook_url && !instagram_url && !whatsapp_url) return null;

  return {
    facebook_url,
    instagram_url,
    whatsapp_url,
  };
}

export function hasPublicSocialLinks(
  links: PublicRestaurantSocialLinks | null | undefined,
): boolean {
  if (!links) return false;
  return Boolean(links.facebook_url || links.instagram_url || links.whatsapp_url);
}

export function isSocialAtPlacement(
  configured: string | null | undefined,
  slot: LiveMenuSocialPlacement,
): boolean {
  return normalizeLiveMenuSocialPlacement(configured) === slot;
}

export function validateSocialLinksForEnable(input: {
  enabled: boolean;
  facebookEnabled: boolean;
  instagramEnabled: boolean;
  whatsappEnabled: boolean;
  facebook_url: string;
  instagram_url: string;
  whatsappConfigured: boolean;
}): string | null {
  if (!input.enabled) return null;

  const facebook = input.facebookEnabled ? normalizeSocialUrl(input.facebook_url) : null;
  const instagram = input.instagramEnabled ? normalizeSocialUrl(input.instagram_url) : null;
  const whatsapp = input.whatsappEnabled && input.whatsappConfigured;

  if (!facebook && !instagram && !whatsapp) {
    return 'Activa al menos una red con su enlace o WhatsApp configurado.';
  }
  if (input.facebookEnabled && !facebook) {
    return 'Agrega un enlace válido de Facebook o desactiva Facebook.';
  }
  if (input.instagramEnabled && !instagram) {
    return 'Agrega un enlace válido de Instagram o desactiva Instagram.';
  }
  if (input.whatsappEnabled && !input.whatsappConfigured) {
    return 'Configura WhatsApp de pedidos en Configuración o desactiva WhatsApp.';
  }
  return null;
}

export function isFacebookHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'facebook.com' || host === 'fb.com' || host === 'm.facebook.com' || host === 'fb.me';
  } catch {
    return false;
  }
}

export function isInstagramHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'instagram.com';
  } catch {
    return false;
  }
}

export function validateFacebookUrlInput(value: string): string | null {
  const normalized = normalizeSocialUrl(value);
  if (!normalized) return null;
  if (!isFacebookHost(normalized)) {
    return 'Usa un enlace de facebook.com o fb.com';
  }
  return null;
}

export function validateInstagramUrlInput(value: string): string | null {
  const normalized = normalizeSocialUrl(value);
  if (!normalized) return null;
  if (!isInstagramHost(normalized)) {
    return 'Usa un enlace de instagram.com';
  }
  return null;
}

export function restaurantSocialLinkSourceFromRestaurant(
  restaurant: RestaurantSocialLinkSource | null | undefined,
) {
  return {
    live_menu_social_enabled: restaurant?.live_menu_social_enabled ?? false,
    live_menu_social_facebook_enabled: restaurant?.live_menu_social_facebook_enabled ?? false,
    live_menu_social_instagram_enabled: restaurant?.live_menu_social_instagram_enabled ?? false,
    live_menu_social_whatsapp_enabled: restaurant?.live_menu_social_whatsapp_enabled ?? false,
    live_menu_social_placement: normalizeLiveMenuSocialPlacement(
      restaurant?.live_menu_social_placement,
    ),
    facebook_url: restaurant?.facebook_url ?? null,
    instagram_url: restaurant?.instagram_url ?? null,
    whatsapp_phone: restaurant?.whatsapp_phone ?? null,
  };
}
