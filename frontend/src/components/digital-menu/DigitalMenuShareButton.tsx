'use client';

import { useCallback, useState } from 'react';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import { triggerHaptic } from '@/lib/haptics/triggerHaptic';
import {
  resolveDigitalMenuShareUrl,
  shareDigitalMenu,
} from '@/lib/digital-menu/shareDigitalMenu';

export type DigitalMenuShareFeedback = 'idle' | 'copied';

export function useShareDigitalMenu(
  restaurantName: string,
  menuUrl: string,
  fallbackSubdomain?: string,
) {
  const [feedback, setFeedback] = useState<DigitalMenuShareFeedback>('idle');

  const share = useCallback(async () => {
    const url = resolveDigitalMenuShareUrl(menuUrl, fallbackSubdomain);
    if (!url) return;

    triggerHaptic('selection');

    try {
      const method = await shareDigitalMenu({ restaurantName, menuUrl: url });
      if (method === 'clipboard') {
        setFeedback('copied');
        window.setTimeout(() => setFeedback('idle'), 2200);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error(error);
    }
  }, [restaurantName, menuUrl, fallbackSubdomain]);

  const ariaLabel =
    feedback === 'copied' ? 'Enlace copiado al portapapeles' : 'Compartir menú';

  return { share, feedback, ariaLabel };
}

type DigitalMenuShareButtonProps = {
  restaurantName: string;
  menuUrl: string;
  fallbackSubdomain?: string;
  className: string;
};

export function DigitalMenuShareButton({
  restaurantName,
  menuUrl,
  fallbackSubdomain,
  className,
}: DigitalMenuShareButtonProps) {
  const { share, ariaLabel } = useShareDigitalMenu(
    restaurantName,
    menuUrl,
    fallbackSubdomain,
  );

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => void share()}
    >
      <IosShareOutlinedIcon fontSize="small" />
    </button>
  );
}
