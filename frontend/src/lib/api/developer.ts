import { apiRequest } from './client';

export type DeveloperWebhook = {
  url: string | null;
  is_enabled: boolean;
  notify_status: boolean;
  notify_location: boolean;
  secret_hint: string | null;
  has_signing_secret: boolean;
};

export type DeveloperApiKey = {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
};

export type DeveloperSettings = {
  webhook: DeveloperWebhook;
  api_keys: DeveloperApiKey[];
};

export type DeveloperWebhookUpdate = {
  url?: string | null;
  is_enabled?: boolean;
  notify_status?: boolean;
  notify_location?: boolean;
};

export function getDeveloperSettings(token: string, restaurantId: string) {
  return apiRequest<DeveloperSettings>(`/restaurants/${restaurantId}/developer`, { token });
}

export function updateDeveloperWebhook(
  token: string,
  restaurantId: string,
  body: DeveloperWebhookUpdate,
) {
  return apiRequest<DeveloperWebhook>(`/restaurants/${restaurantId}/developer/webhook`, {
    method: 'PUT',
    token,
    body,
  });
}

export function rotateDeveloperWebhookSecret(token: string, restaurantId: string) {
  return apiRequest<{ signing_secret: string; secret_hint: string }>(
    `/restaurants/${restaurantId}/developer/webhook/rotate-secret`,
    { method: 'POST', token },
  );
}

export type DeveloperSentEvent = {
  received_at: string;
  body: Record<string, unknown>;
  delivered: boolean | null;
};

export function listDeveloperWebhookEvents(token: string, restaurantId: string) {
  return apiRequest<{ items: DeveloperSentEvent[] }>(
    `/restaurants/${restaurantId}/developer/webhook/events`,
    { token },
  );
}

export function testDeveloperWebhook(token: string, restaurantId: string) {
  return apiRequest<{ ok: boolean; status_code: number | null; error: string | null }>(
    `/restaurants/${restaurantId}/developer/webhook/test`,
    { method: 'POST', token },
  );
}

export function createDeveloperApiKey(token: string, restaurantId: string, label: string) {
  return apiRequest<DeveloperApiKey & { api_key: string }>(
    `/restaurants/${restaurantId}/developer/api-keys`,
    {
      method: 'POST',
      token,
      body: { label },
    },
  );
}

export function revokeDeveloperApiKey(token: string, restaurantId: string, keyId: string) {
  return apiRequest<void>(`/restaurants/${restaurantId}/developer/api-keys/${keyId}`, {
    method: 'DELETE',
    token,
  });
}
