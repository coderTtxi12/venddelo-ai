const NOTIFICATION_SOUND_URL = '/assets/sounds/notification.wav';
const REPEAT_COUNT = 3;
const GAP_MS = 200;

let audioUnlocked = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playOnce(): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.preload = 'auto';
    const done = () => resolve();
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    void audio.play().catch(done);
  });
}

async function playNotificationSequence(): Promise<void> {
  for (let i = 0; i < REPEAT_COUNT; i += 1) {
    await playOnce();
    if (i < REPEAT_COUNT - 1) {
      await sleep(GAP_MS);
    }
  }
}

export function unlockNewOrderAudio(): void {
  audioUnlocked = true;
}

export function attachNewOrderAudioUnlock(): () => void {
  const unlock = () => unlockNewOrderAudio();

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

export function playNewOrderSound(): void {
  if (!audioUnlocked) return;
  void playNotificationSequence();
}
