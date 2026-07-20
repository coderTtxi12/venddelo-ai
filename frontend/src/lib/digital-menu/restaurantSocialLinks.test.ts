import { describe, expect, it } from 'vitest';
import {
  buildRestaurantSocialLinks,
  isSocialAtPlacement,
  normalizeLiveMenuSocialPlacement,
  validateFacebookUrlInput,
  validateInstagramUrlInput,
  validateSocialLinksForEnable,
} from './restaurantSocialLinks';

describe('buildRestaurantSocialLinks', () => {
  it('returns null when disabled', () => {
    expect(
      buildRestaurantSocialLinks({
        live_menu_social_enabled: false,
        live_menu_social_facebook_enabled: true,
        live_menu_social_instagram_enabled: false,
        live_menu_social_whatsapp_enabled: false,
        facebook_url: 'https://facebook.com/taco',
        instagram_url: null,
        whatsapp_phone: '+5215512345678',
      }),
    ).toBeNull();
  });

  it('respects per-network toggles', () => {
    expect(
      buildRestaurantSocialLinks({
        live_menu_social_enabled: true,
        live_menu_social_facebook_enabled: false,
        live_menu_social_instagram_enabled: true,
        live_menu_social_whatsapp_enabled: true,
        facebook_url: 'https://facebook.com/taco',
        instagram_url: 'instagram.com/taco',
        whatsapp_phone: '+5215512345678',
      }),
    ).toEqual({
      facebook_url: null,
      instagram_url: 'https://instagram.com/taco',
      whatsapp_url: 'https://wa.me/5215512345678',
    });
  });
});

describe('validateSocialLinksForEnable', () => {
  it('allows whatsapp only when configured', () => {
    expect(
      validateSocialLinksForEnable({
        enabled: true,
        facebookEnabled: false,
        instagramEnabled: false,
        whatsappEnabled: true,
        facebook_url: '',
        instagram_url: '',
        whatsappConfigured: true,
      }),
    ).toBeNull();
  });

  it('requires at least one channel when enabled', () => {
    expect(
      validateSocialLinksForEnable({
        enabled: true,
        facebookEnabled: false,
        instagramEnabled: false,
        whatsappEnabled: false,
        facebook_url: '',
        instagram_url: '',
        whatsappConfigured: false,
      }),
    ).toBe('Activa al menos una red con su enlace o WhatsApp configurado.');
  });
});

describe('placement helpers', () => {
  it('normalizes invalid placement to footer', () => {
    expect(normalizeLiveMenuSocialPlacement('unknown')).toBe('footer');
  });

  it('matches configured placement slot', () => {
    expect(isSocialAtPlacement('intro', 'intro')).toBe(true);
    expect(isSocialAtPlacement('intro', 'footer')).toBe(false);
  });
});

describe('validateSocialUrls', () => {
  it('validates facebook host', () => {
    expect(validateFacebookUrlInput('https://instagram.com/x')).toMatch(/facebook/i);
    expect(validateFacebookUrlInput('https://facebook.com/x')).toBeNull();
  });

  it('validates instagram host', () => {
    expect(validateInstagramUrlInput('https://facebook.com/x')).toMatch(/instagram/i);
    expect(validateInstagramUrlInput('https://instagram.com/x')).toBeNull();
  });
});
