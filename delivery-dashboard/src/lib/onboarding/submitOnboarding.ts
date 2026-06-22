import { apiRequest } from '@/lib/api/client';
import { buildOnboardingPayload } from '@/lib/onboarding/validation';
import type { OnboardingData } from '@/lib/onboarding/types';
import type { DeliveryProvider } from '@/lib/api/types';

export async function submitOnboarding(
  token: string,
  data: OnboardingData,
): Promise<DeliveryProvider> {
  return apiRequest<DeliveryProvider>('/delivery-providers/onboarding', {
    method: 'POST',
    token,
    body: buildOnboardingPayload(data),
  });
}
