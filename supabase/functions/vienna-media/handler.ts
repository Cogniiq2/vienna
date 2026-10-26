/**
 * vienna-media – Logik der Edge Function (laufzeitunabhängig, dadurch testbar).
 *
 * Aufgabe: Eltern-Geräte haben KEINE Supabase-Session. Für private Fotos stellt diese Funktion
 * kurzlebige, signierte URLs aus – ausschließlich für Vienna-Buckets und nur für Pfade, die die
 * Datenbank für den per Token nachgewiesenen Trip erzeugt bzw. registriert hat.
 *
 * Sicherheit:
 * - Jeder Aufruf braucht Trip-Token + Geräte-ID; die Prüfung macht die Datenbank (vienna.require_trip).
 * - Der Client übergibt NIE frei einen Schreibpfad. Upload-Pfade entstehen in vienna_media_issue_upload.
 * - Lese-URLs nur für Pfade, die vienna_media_readable für diesen Trip bestätigt.
 * - Nur die Buckets `vienna-day` und `vienna-memories` sind erlaubt (zusätzliche Prüfung hier).
 * - Fehler verraten nichts über Trips („invalid_token“ ist für alle ungültigen Fälle gleich).
 * - CORS nur für konfigurierte Vienna-Domains; einfache Rate-Limits pro IP; kleine Request-Bodies.
 */

export const VIENNA_BUCKETS = ['vienna-day', 'vienna-memories'] as const;
export type ViennaBucket = (typeof VIENNA_BUCKETS)[number];

const READ_URL_TTL_SECONDS = 60 * 60 * 6;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_PATHS = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{24,128}$/;
const CHAPTERS = new Set(['morning', 'mission', 'tennis', 'spa', 'dinner']);

export interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

/** Zugriffe mit Service-Rolle – werden im Deno-Einstieg mit supabase-js umgesetzt. */
export interface MediaDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  createSignedUploadUrl(bucket: ViennaBucket, path: string): Promise<{ signedUrl: string; token: string } | null>;
  createSignedUrls(bucket: ViennaBucket, paths: string[], expiresIn: number): Promise<Array<{ path: string; signedUrl: string }>>;
  remove(bucket: ViennaBucket, paths: string[]): Promise<void>;
  /** Liegt die Datei wirklich im Bucket? (vor dem Bestätigen eines Uploads) */
  exists(bucket: ViennaBucket, path: string): Promise<boolean>;
}

export interface MediaConfig {
  /** Erlaubte Origins, z. B. "https://vienna-gift.pages.dev,https://*.vienna-gift.pages.dev". */
  allowedOrigins: string[];
  /** Reset (Testdaten löschen) erlauben? In Produktion aus. */
  allowReset: boolean;
}

export function parseConfig(env: { get(key: string): string | undefined }): MediaConfig {
  return {
    allowedOrigins: (env.get('VIENNA_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    allowReset: env.get('VIENNA_ALLOW_RESET') === 'true',
  };
}

/** Exakte Origins oder Wildcard für Preview-Subdomains: https://*.projekt.pages.dev */
export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((rule) => {
    if (!rule.includes('*')) return rule === origin;
    const [scheme, host] = rule.split('://');
    if (!scheme || !host?.startsWith('*.')) return false;
    const suffix = host.slice(1); // ".projekt.pages.dev"
    try {
      const url = new URL(origin);
      return `${url.protocol}` === `${scheme}:` && url.hostname.endsWith(suffix) && url.hostname.length > suffix.length;
    } catch {
      return false;
    }
  });
}

/** Einfaches Sliding-Window-Limit pro Schlüssel (pro Edge-Instanz; ergänzt die DB-Limits). */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear(); // Speicher begrenzen
    return true;
  };
}

function corsHeaders(origin: string | null, config: MediaConfig): Record<string, string> {
  if (!isOriginAllowed(origin, config.allowedOrigins)) return {};
  return {
    'access-control-allow-origin': origin ?? '',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
  });
}

/** DB-Fehler in neutrale Codes übersetzen – nie Details nach außen geben. */
function mapError(message: string | undefined): { status: number; code: string } {
  if (message?.includes('invalid_token')) return { status: 401, code: 'invalid_token' };
  if (message?.includes('rate_limited')) return { status: 429, code: 'rate_limited' };
  if (message?.includes('invalid_upload') || message?.includes('invalid_chapter')) return { status: 400, code: 'invalid_request' };
  return { status: 500, code: 'unavailable' };
}

function isViennaBucket(value: unknown): value is ViennaBucket {
  return typeof value === 'string' && (VIENNA_BUCKETS as readonly string[]).includes(value);
}

/** Zusätzliche Absicherung: nur Vienna-Pfade der erwarteten Form. */
function isViennaPath(bucket: ViennaBucket, path: string): boolean {
  return bucket === 'vienna-day'
    ? /^trips\/[0-9a-f-]{36}\/day\/[a-z]+-[0-9a-f]{32}\.jpg$/.test(path)
    : /^trips\/[0-9a-f-]{36}\/(family|video|audio)\/[A-Za-z]+-[a-z0-9]+\.[a-z0-9]{2,5}$/.test(path);
}

interface BaseBody {
  action?: unknown;
  token?: unknown;
  deviceId?: unknown;
}

export async function handleMediaRequest(
  req: Request,
  deps: MediaDeps,
  config: MediaConfig,
  limiter: (key: string) => boolean,
): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, config);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
  }
  if (origin && !Object.keys(cors).length) return json(403, { error: 'forbidden_origin' }, {});
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!limiter(ip)) return json(429, { error: 'rate_limited' }, cors);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too_large' }, cors);
  let body: BaseBody & Record<string, unknown>;
  try {
    body = JSON.parse(raw) as BaseBody & Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_request' }, cors);
  }
  const { action, token, deviceId } = body;
  // Formatfehler beim Token sehen genauso aus wie ein unbekannter Token.
  if (typeof token !== 'string' || !TOKEN.test(token) || typeof deviceId !== 'string' || !UUID.test(deviceId)) {
    return json(401, { error: 'invalid_token' }, cors);
  }
  const auth = { p_token: token, p_device_id: deviceId };

  try {
    switch (action) {
      case 'upload-url': {
        const chapterId = body.chapterId;
        if (typeof chapterId !== 'string' || !CHAPTERS.has(chapterId)) return json(400, { error: 'invalid_request' }, cors);
        const { data, error } = await deps.rpc('vienna_media_issue_upload', { ...auth, p_chapter_id: chapterId });
        if (error) {
          const e = mapError(error.message);
          return json(e.status, { error: e.code }, cors);
        }
        const ticket = data as { bucket?: unknown; path?: unknown } | null;
        if (!ticket || ticket.bucket !== 'vienna-day' || typeof ticket.path !== 'string' || !isViennaPath('vienna-day', ticket.path)) {
          return json(500, { error: 'unavailable' }, cors);
        }
        const signed = await deps.createSignedUploadUrl('vienna-day', ticket.path);
        if (!signed) return json(500, { error: 'unavailable' }, cors);
        return json(200, { bucket: 'vienna-day', path: ticket.path, uploadToken: signed.token }, cors);
      }

      case 'confirm-upload': {
        const { chapterId, path, capturedAt } = body;
        if (typeof chapterId !== 'string' || !CHAPTERS.has(chapterId) || typeof path !== 'string' || !isViennaPath('vienna-day', path)) {
          return json(400, { error: 'invalid_request' }, cors);
        }
        if (!(await deps.exists('vienna-day', path))) return json(409, { error: 'not_uploaded' }, cors);
        const { data, error } = await deps.rpc('vienna_media_confirm_upload', {
          ...auth,
          p_chapter_id: chapterId,
          p_path: path,
          p_captured_at: typeof capturedAt === 'string' ? capturedAt : null,
        });
        if (error) {
          const e = mapError(error.message);
          return json(e.status, { error: e.code }, cors);
        }
        // Ersetztes Foto aufräumen (nur gültige Vienna-Pfade).
        if (typeof data === 'string' && data !== path && isViennaPath('vienna-day', data)) {
          await deps.remove('vienna-day', [data]).catch(() => undefined);
        }
        return json(200, { ok: true }, cors);
      }

      case 'read-urls': {
        const paths = body.paths;
        if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS || !paths.every((p) => typeof p === 'string' && p.length < 300)) {
          return json(400, { error: 'invalid_request' }, cors);
        }
        const { data, error } = await deps.rpc('vienna_media_readable', { ...auth, p_paths: paths });
        if (error) {
          const e = mapError(error.message);
          return json(e.status, { error: e.code }, cors);
        }
        const allowed = (Array.isArray(data) ? data : []) as Array<{ bucket?: unknown; path?: unknown }>;
        const byBucket = new Map<ViennaBucket, string[]>();
        for (const item of allowed) {
          if (!isViennaBucket(item.bucket) || typeof item.path !== 'string' || !isViennaPath(item.bucket, item.path)) continue;
          byBucket.set(item.bucket, [...(byBucket.get(item.bucket) ?? []), item.path]);
        }
        const urls: Record<string, string> = {};
        for (const [bucket, list] of byBucket) {
          for (const s of await deps.createSignedUrls(bucket, list, READ_URL_TTL_SECONDS)) urls[s.path] = s.signedUrl;
        }
        return json(200, { urls, expiresIn: READ_URL_TTL_SECONDS }, cors);
      }

      case 'reset': {
        if (!config.allowReset) return json(403, { error: 'reset_disabled' }, cors);
        const { data, error } = await deps.rpc('vienna_media_reset', auth);
        if (error) {
          const e = mapError(error.message);
          return json(e.status, { error: e.code }, cors);
        }
        const paths = (Array.isArray(data) ? data : []).filter(
          (p): p is string => typeof p === 'string' && isViennaPath('vienna-day', p),
        );
        if (paths.length) await deps.remove('vienna-day', paths);
        return json(200, { ok: true, removed: paths.length }, cors);
      }

      default:
        return json(400, { error: 'invalid_request' }, cors);
    }
  } catch {
    return json(500, { error: 'unavailable' }, cors);
  }
}
