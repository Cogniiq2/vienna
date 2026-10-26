import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Lazy geladene Supabase-Clients:
 * - 'trip':  OHNE Session. Die Eltern melden sich nie an; jeder Aufruf trägt Trip-Token + Geräte-ID.
 *            Requests laufen nur mit dem öffentlichen Anon-/Publishable-Key.
 * - 'admin': E-Mail-Login (Magic Link, PKCE) für das Admin-Dashboard.
 */
const clients = new Map<'trip' | 'admin', Promise<SupabaseClient>>();

export function getSupabase(kind: 'trip' | 'admin'): Promise<SupabaseClient> {
  let client = clients.get(kind);
  if (!client) {
    client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        env.supabaseUrl,
        env.supabaseAnonKey,
        kind === 'admin'
          ? {
              auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
                storageKey: 'vienna:admin-auth',
              },
            }
          : { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vienna:trip-none' } },
      ),
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

/** Eigene private Buckets des Vienna-Moduls (kein fremder Bucket wird benutzt). */
export const DAY_BUCKET = 'vienna-day';
export const MEMORIES_BUCKET = 'vienna-memories';

/** Edge Function für signierte Upload-/Lese-URLs der Eltern-Geräte. */
export const MEDIA_FUNCTION = 'vienna-media';

/** Storage-Pfade – müssen zu Migration und Edge Function passen. Tagesfoto-Pfade erzeugt nur der Server. */
export const storagePaths = {
  isDayPhoto: (path: string) => /^trips\/[0-9a-f-]{36}\/day\//.test(path),
  asset: (tripId: string, kind: 'image' | 'video' | 'audio', slot: string, unique: string, ext: string) =>
    `trips/${tripId}/${kind === 'image' ? 'family' : kind}/${slot}-${unique}.${ext}`,
};
