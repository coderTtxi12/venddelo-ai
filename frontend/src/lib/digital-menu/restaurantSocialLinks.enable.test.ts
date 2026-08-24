import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSocialLinksForEnable } from './restaurantSocialLinks.ts';

test('rejects enabling Facebook without a URL even if the live-menu master is still off', () => {
  const error = validateSocialLinksForEnable({
    enabled: false,
    facebookEnabled: true,
    instagramEnabled: false,
    whatsappEnabled: false,
    facebook_url: '',
    instagram_url: '',
    whatsappConfigured: false,
  });

  assert.equal(error, 'Agrega un enlace válido de Facebook o desactiva Facebook.');
});

test('allows configuring Facebook with a URL before turning on the live-menu master', () => {
  const error = validateSocialLinksForEnable({
    enabled: false,
    facebookEnabled: true,
    instagramEnabled: false,
    whatsappEnabled: false,
    facebook_url: 'https://facebook.com/tunegocio',
    instagram_url: '',
    whatsappConfigured: false,
  });

  assert.equal(error, null);
});

test('allows saving a Facebook URL while that channel is still off', () => {
  const error = validateSocialLinksForEnable({
    enabled: false,
    facebookEnabled: false,
    instagramEnabled: false,
    whatsappEnabled: false,
    facebook_url: 'https://facebook.com/tunegocio',
    instagram_url: '',
    whatsappConfigured: false,
  });

  assert.equal(error, null);
});
