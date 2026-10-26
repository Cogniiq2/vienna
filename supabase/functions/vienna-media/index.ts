// Supabase Edge Function `vienna-media` (Deno). Dünner Einstieg – die Logik steht in handler.ts.
//
// Deploy:   supabase functions deploy vienna-media --no-verify-jwt --project-ref <ref>
// Secrets:  supabase secrets set VIENNA_ALLOWED_ORIGINS=https://<projekt>.pages.dev,https://*.<projekt>.pages.dev
//           (optional, nur zum Testen) supabase secrets set VIENNA_ALLOW_RESET=true
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit – der Key verlässt Supabase nie.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createRateLimiter, handleMediaRequest, parseConfig, type MediaDeps } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const config = parseConfig(Deno.env);
// 120 Anfragen pro Minute und IP (pro Instanz) – genug für zwei Handys inkl. Offline-Nachholen.
const limiter = createRateLimiter(120, 60_000);

const deps: MediaDeps = {
  async rpc(fn, args) {
    const { data, error } = await admin.rpc(fn, args);
    return { data: data as unknown, error: error ? { message: error.message } : null };
  },
  async createSignedUploadUrl(bucket, path) {
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
    return error || !data ? null : { signedUrl: data.signedUrl, token: data.token };
  },
  async createSignedUrls(bucket, paths, expiresIn) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, expiresIn);
    if (error || !data) return [];
    return data.flatMap((d) => (d.path && d.signedUrl ? [{ path: d.path, signedUrl: d.signedUrl }] : []));
  },
  async remove(bucket, paths) {
    await admin.storage.from(bucket).remove(paths);
  },
  async exists(bucket, path) {
    const slash = path.lastIndexOf('/');
    const { data, error } = await admin.storage
      .from(bucket)
      .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
    return !error && !!data?.some((f) => f.name === path.slice(slash + 1));
  },
};

Deno.serve((req) => handleMediaRequest(req, deps, config, limiter));
