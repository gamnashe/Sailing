import type { DataStore } from './dataStore';
import { LocalStore } from './localStore';
import { SupabaseStore } from './supabaseStore';
import { createSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export * from './sailRules';
export type { DataStore } from './dataStore';

/**
 * The app's data store: Supabase when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set,
 * otherwise the local demo store (localStorage only, no server).
 */
export const store: DataStore = isSupabaseConfigured ? new SupabaseStore(createSupabaseClient()) : new LocalStore();
