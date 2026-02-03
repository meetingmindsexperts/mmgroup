import type { Env } from '../../types';
import type { LeadsProvider } from './types';
import { SupabaseLeadsProvider } from './supabase';

export type { LeadsProvider } from './types';

/**
 * Create a leads provider instance
 *
 * Currently only supports Supabase, but can be extended
 * to support other providers in the future.
 */
export function createLeadsProvider(env: Env): LeadsProvider | null {
  // Check if Supabase is configured
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('Supabase not configured - lead capture disabled');
    return null;
  }

  return new SupabaseLeadsProvider(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

/**
 * Check if lead capture is enabled
 */
export function isLeadCaptureEnabled(env: Env): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}
