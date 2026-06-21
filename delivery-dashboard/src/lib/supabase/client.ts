import { createBrowserClient } from '@supabase/ssr';

function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      return {
        url: 'https://placeholder.supabase.co',
        key: 'placeholder-anon-key',
      };
    }
  }
  return { url: url!, key: key! };
}

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
