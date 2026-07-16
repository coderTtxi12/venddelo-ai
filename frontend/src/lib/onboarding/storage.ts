import { createDefaultOnboardingData } from './defaults';
import type { OnboardingData, OnboardingProgress, OnboardingStepId, PersistedOnboardingState } from './types';

const STORAGE_PREFIX = 'venddelo:onboarding:';
const POST_ONBOARDING_CHAT_KEY = 'venddelo:open-assistant-after-onboarding';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadOnboardingState(userId: string): PersistedOnboardingState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedOnboardingState;
    if (parsed.version !== 1 || parsed.userId !== userId) return null;

    return {
      ...parsed,
      data: {
        ...createDefaultOnboardingData(),
        ...parsed.data,
      },
    };
  } catch {
    return null;
  }
}

export function saveOnboardingState(
  userId: string,
  data: OnboardingData,
  progress: OnboardingProgress,
): void {
  if (typeof window === 'undefined') return;

  const payload: PersistedOnboardingState = {
    version: 1,
    userId,
    data,
    progress,
  };

  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.warn('[onboarding] No se pudo guardar en localStorage', error);
  }
}

export function clearOnboardingState(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(userId));
}

/** One-shot flag: open assistant chat after landing on /digital-menu post-onboarding. */
export function markOpenAssistantAfterOnboarding(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(POST_ONBOARDING_CHAT_KEY, '1');
}

export function consumeOpenAssistantAfterOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(POST_ONBOARDING_CHAT_KEY) !== '1') return false;
  sessionStorage.removeItem(POST_ONBOARDING_CHAT_KEY);
  return true;
}

export const ONBOARDING_STEP_ORDER: OnboardingStepId[] = [
  'businessName',
  'subdomain',
  'description',
  'ownerName',
  'ownerPhone',
  'branchCount',
  'logo',
  'cover',
  'location',
  'schedule',
  'orderTypes',
  'paymentMethods',
  'whatsapp',
];

export function getVisibleSteps(data: OnboardingData): OnboardingStepId[] {
  return ONBOARDING_STEP_ORDER.filter((step) => {
    if (step === 'paymentMethods') return data.takeoutEnabled;
    return true;
  });
}

export function stepIndex(steps: OnboardingStepId[], stepId: OnboardingStepId): number {
  return steps.indexOf(stepId);
}
