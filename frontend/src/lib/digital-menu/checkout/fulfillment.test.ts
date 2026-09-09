import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicCheckoutConfig } from '../../api/public.ts';
import { resolveAvailableServices } from './fulfillment.ts';

function config(overrides: Partial<PublicCheckoutConfig> = {}): PublicCheckoutConfig {
  return {
    takeout_enabled: true,
    delivery_enabled: true,
    payment_methods: [],
    delivery_service: {
      available: false,
      reason: 'Mexy pausó las entregas de tu negocio. Escríbenos por WhatsApp para reactivarlas.',
      partnership_status: 'active',
      provider_name: 'Mexy',
      weather_mode: 'none',
      on_hold: true,
    },
    ...overrides,
  };
}

test('on_hold omits delivery from customer services', () => {
  assert.deepEqual(resolveAvailableServices(config()), ['takeout']);
});

test('weather unavailable still offers delivery as a service type', () => {
  const weather = config({
    delivery_service: {
      available: false,
      reason: 'El servicio de reparto no está disponible en este momento. Mexy pausó las entregas por lluvia intensa.',
      partnership_status: 'active',
      provider_name: 'Mexy',
      weather_mode: 'intense',
      on_hold: false,
    },
  });
  assert.deepEqual(resolveAvailableServices(weather), ['delivery', 'takeout']);
});
