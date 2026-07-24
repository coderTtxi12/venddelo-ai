import { DM_Sans, Outfit } from 'next/font/google';
import type { ReactNode } from 'react';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-landing-display',
  weight: ['500', '600', '700'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-landing-body',
  weight: ['400', '500', '600', '700'],
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`${outfit.variable} ${dmSans.variable}`}>{children}</div>;
}
