import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// import.meta.env is undefined outside Vite (e.g. when tests run under tsx), hence the optional chaining.
const url: string | undefined = import.meta.env?.VITE_SUPABASE_URL;
const anonKey: string | undefined = import.meta.env?.VITE_SUPABASE_ANON_KEY;

/** True when both Supabase env vars are set; otherwise the app runs in local demo mode. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export function createSupabaseClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
