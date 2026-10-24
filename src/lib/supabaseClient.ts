import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Lazy geladene Supabase-Clients. Zwei getrennte Sessions:
 * - 'trip':  anonyme Session der Eltern (pro Gerät)
 * - 'admin': E-Mail-Login (Magic Link) für das Admin-Dashboard
 */
const clients = new Map<'trip' | 'admin', Promise<SupabaseClient>>();

export function getSupabase(kind: 'trip' | 'admin'): Promise<SupabaseClient> {
  let client = clients.get(kind);
  if (!client) {
    client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: kind === 'admin',
          flowType: kind === 'admin' ? 'pkce' : 'implicit',
          storageKey: kind === 'admin' ? 'vienna:admin-auth' : 'vienna:auth',
        },
      }),
    );
    clients.set(kind, client);
  }
  return client;
}

/** Typsicherer RPC-Aufruf (Supabase liefert sonst `any`). */
export async function callRpc(sb: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const res = await sb.rpc(fn, args);
  return { data: res.data as unknown, error: res.error };
}

export const BUCKETS = { photos: 'memories', family: 'family' } as const;
