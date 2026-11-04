import localFont from 'next/font/local';

// Self-hosted latin subsets so `next build` never fetches Google Fonts.
// Avoids intermittent Vercel failures from next/font/google + extensionless
// /l/font?kit= URLs (vercel/next.js#99114).

export const inter = localFont({
  src: './inter-latin.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

export const outfit = localFont({
  src: './outfit-latin.woff2',
  variable: '--font-landing-display',
  weight: '100 900',
  display: 'swap',
});

export const dmSans = localFont({
  src: './dm-sans-latin.woff2',
  variable: '--font-landing-body',
  weight: '100 1000',
  display: 'swap',
});

export const ebGaramond = localFont({
  src: './eb-garamond-latin.woff2',
  variable: '--font-legal-display',
  weight: '400 800',
  display: 'swap',
});

export const lato = localFont({
  src: [
    { path: './lato-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './lato-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-legal-body',
  display: 'swap',
});
