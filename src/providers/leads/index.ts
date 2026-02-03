import type { Env } from '../../types';
import type { LeadsProvider } from './types';
import { SupabaseLeadsProvider } from './supabase';

export type { LeadsProvider } from './types';

/**
 * Create a leads provider instance
 *
 * Requires SUPABASE_URL, SUPABASE_ANON_KEY, and CHATBOT_API_KEY.
 * The CHATBOT_API_KEY is used to authenticate with the secure edge function.
 */
export function createLeadsProvider(env: Env): LeadsProvider | null {
  // Check if Supabase is configured
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('Supabase not configured - lead capture disabled');
    return null;
  }

  if (!env.CHATBOT_API_KEY) {
    console.warn('CHATBOT_API_KEY not configured - lead capture disabled');
    return null;
  }

  return new SupabaseLeadsProvider(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    env.CHATBOT_API_KEY
  );
}

/**
 * Check if lead capture is enabled
 */
export function isLeadCaptureEnabled(env: Env): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.CHATBOT_API_KEY);
}
