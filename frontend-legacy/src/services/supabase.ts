import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    '[supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el entorno.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
