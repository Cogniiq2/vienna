// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter, handleMediaRequest, isOriginAllowed, parseConfig, type MediaConfig, type MediaDeps } from './handler.ts';

const TRIP = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'A'.repeat(32);
const DEVICE = '0e6f6a3c-1b2d-4c5e-8f90-123456789abc';
const DAY_PATH = `trips/${TRIP}/day/spa-${'a'.repeat(32)}.jpg`;
const ASSET_PATH = `trips/${TRIP}/family/familyCurrent-abc123.jpg`;
const ORIGIN = 'https://vienna-gift.pages.dev';

const config: MediaConfig = { allowedOrigins: [ORIGIN, 'https://*.vienna-gift.pages.dev'], allowReset: false };

function makeDeps(overrides: Partial<MediaDeps> = {}) {
  const deps = {
    rpc: vi.fn<MediaDeps['rpc']>(async () => ({ data: null, error: null })),
    createSignedUploadUrl: vi.fn<MediaDeps['createSignedUploadUrl']>(async (_b, path) => ({ signedUrl: `https://x.supabase.co/up/${path}?token=t`, token: 't' })),
    createSignedUrls: vi.fn<MediaDeps['createSignedUrls']>(async (bucket, paths) => paths.map((path) => ({ path, signedUrl: `https://x.supabase.co/${bucket}/${path}` }))),
    remove: vi.fn<MediaDeps['remove']>(async () => undefined),
    exists: vi.fn<MediaDeps['exists']>(async () => true),
    ...overrides,
  };
  return deps;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://x.supabase.co/functions/v1/vienna-media', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const open = () => true;
const auth = { token: TOKEN, deviceId: DEVICE };

describe('CORS', () => {
  it('erlaubt nur konfigurierte Origins (exakt + Preview-Wildcard)', () => {
    expect(isOriginAllowed(ORIGIN, config.allowedOrigins)).toBe(true);
    expect(isOriginAllowed('https://abc123.vienna-gift.pages.dev', config.allowedOrigins)).toBe(true);
    expect(isOriginAllowed('https://vienna-gift.pages.dev.evil.com', config.allowedOrigins)).toBe(false);
    expect(isOriginAllowed('https://evilvienna-gift.pages.dev', config.allowedOrigins)).toBe(false);
    expect(isOriginAllowed('http://abc.vienna-gift.pages.dev', config.allowedOrigins)).toBe(false);
    expect(isOriginAllowed(null, config.allowedOrigins)).toBe(false);
  });

  it('Preflight: 204 für erlaubte, 403 für fremde Origins', async () => {
    const ok = await handleMediaRequest(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: ORIGIN } }), makeDeps(), config, open);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await handleMediaRequest(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://evil.com' } }), makeDeps(), config, open);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('POST von fremder Origin wird abgewiesen, ohne die DB zu fragen', async () => {
    const deps = makeDeps();
    const res = await handleMediaRequest(post({ action: 'read-urls', ...auth, paths: [DAY_PATH] }, { origin: 'https://evil.com' }), deps, config, open);
    expect(res.status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('parseConfig liest Origins und Reset-Schalter', () => {
    const env = new Map([['VIENNA_ALLOWED_ORIGINS', ' https://a.pages.dev/ , https://*.a.pages.dev ']]);
    expect(parseConfig(env)).toEqual({ allowedOrigins: ['https://a.pages.dev', 'https://*.a.pages.dev'], allowReset: false });
  });
});

describe('Token & Missbrauchsschutz', () => {
  it('fehlender/kaputter Token → 401 invalid_token, keine DB-Abfrage', async () => {
    const deps = makeDeps();
    for (const body of [{ action: 'upload-url', chapterId: 'spa' }, { ...auth, token: 'short' }, { ...auth, deviceId: 'nope' }]) {
      const res = await handleMediaRequest(post(body), deps, config, open);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_token' });
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('unbekannter Token → 401 ohne Details aus der DB', async () => {
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: null, error: { message: 'invalid_token (trip xyz)' } })) });
    const res = await handleMediaRequest(post({ action: 'read-urls', ...auth, paths: [DAY_PATH] }), deps, config, open);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"invalid_token"}');
  });

  it('interne Fehler werden neutralisiert', async () => {
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: null, error: { message: 'relation vienna.trips secret detail' } })) });
    const res = await handleMediaRequest(post({ action: 'upload-url', ...auth, chapterId: 'spa' }), deps, config, open);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('Rate-Limit pro IP', async () => {
    let t = 0;
    const limiter = createRateLimiter(2, 1000, () => t);
    expect(limiter('a')).toBe(true);
    expect(limiter('a')).toBe(true);
    expect(limiter('a')).toBe(false);
    expect(limiter('b')).toBe(true);
    t = 1500;
    expect(limiter('a')).toBe(true);
    const res = await handleMediaRequest(post({ action: 'read-urls', ...auth, paths: [DAY_PATH] }), makeDeps(), config, () => false);
    expect(res.status).toBe(429);
  });

  it('DB-Limit (rate_limited) → 429', async () => {
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: null, error: { message: 'rate_limited' } })) });
    const res = await handleMediaRequest(post({ action: 'upload-url', ...auth, chapterId: 'spa' }), deps, config, open);
    expect(res.status).toBe(429);
  });

  it('zu große oder kaputte Bodies werden abgelehnt', async () => {
    expect((await handleMediaRequest(post('x'.repeat(9000)), makeDeps(), config, open)).status).toBe(413);
    expect((await handleMediaRequest(post('{nope'), makeDeps(), config, open)).status).toBe(400);
    expect((await handleMediaRequest(new Request('https://x/f', { method: 'GET', headers: { origin: ORIGIN } }), makeDeps(), config, open)).status).toBe(405);
  });
});

describe('upload-url', () => {
  it('Pfad kommt vom Server; der Client kann keinen Pfad vorgeben', async () => {
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: { bucket: 'vienna-day', path: DAY_PATH }, error: null })) });
    const res = await handleMediaRequest(post({ action: 'upload-url', ...auth, chapterId: 'spa', path: 'trips/other/evil.jpg', bucket: 'avatars' }), deps, config, open);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bucket: 'vienna-day', path: DAY_PATH, uploadToken: 't' });
    expect(deps.rpc).toHaveBeenCalledWith('vienna_media_issue_upload', { p_token: TOKEN, p_device_id: DEVICE, p_chapter_id: 'spa' });
    expect(deps.createSignedUploadUrl).toHaveBeenCalledWith('vienna-day', DAY_PATH);
  });

  it('unbekanntes Kapitel → 400', async () => {
    const deps = makeDeps();
    const res = await handleMediaRequest(post({ action: 'upload-url', ...auth, chapterId: '../../x' }), deps, config, open);
    expect(res.status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('liefert die DB einen unerwarteten Bucket/Pfad, wird nichts signiert', async () => {
    for (const data of [{ bucket: 'avatars', path: DAY_PATH }, { bucket: 'vienna-day', path: 'public/x.jpg' }]) {
      const deps = makeDeps({ rpc: vi.fn(async () => ({ data, error: null })) });
      const res = await handleMediaRequest(post({ action: 'upload-url', ...auth, chapterId: 'spa' }), deps, config, open);
      expect(res.status).toBe(500);
      expect(deps.createSignedUploadUrl).not.toHaveBeenCalled();
    }
  });
});

describe('confirm-upload', () => {
  it('bestätigt nur existierende Dateien und räumt das ersetzte Foto auf', async () => {
    const old = `trips/${TRIP}/day/spa-${'b'.repeat(32)}.jpg`;
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: old, error: null })) });
    const res = await handleMediaRequest(post({ action: 'confirm-upload', ...auth, chapterId: 'spa', path: DAY_PATH, capturedAt: '2026-10-27T10:00:00Z' }), deps, config, open);
    expect(res.status).toBe(200);
    expect(deps.exists).toHaveBeenCalledWith('vienna-day', DAY_PATH);
    expect(deps.rpc).toHaveBeenCalledWith('vienna_media_confirm_upload', expect.objectContaining({ p_path: DAY_PATH, p_chapter_id: 'spa' }));
    expect(deps.remove).toHaveBeenCalledWith('vienna-day', [old]);
  });

  it('nicht hochgeladene Datei → 409, keine Registrierung', async () => {
    const deps = makeDeps({ exists: vi.fn(async () => false) });
    const res = await handleMediaRequest(post({ action: 'confirm-upload', ...auth, chapterId: 'spa', path: DAY_PATH }), deps, config, open);
    expect(res.status).toBe(409);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('fremde/ungültige Pfade werden gar nicht erst geprüft', async () => {
    const deps = makeDeps();
    for (const path of [ASSET_PATH, '../secret', `trips/${TRIP}/day/spa-x.jpg`, 'avatars/u1.png']) {
      const res = await handleMediaRequest(post({ action: 'confirm-upload', ...auth, chapterId: 'spa', path }), deps, config, open);
      expect(res.status).toBe(400);
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('Ticket fehlt/fremder Trip (invalid_upload) → 400', async () => {
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: null, error: { message: 'invalid_upload' } })) });
    const res = await handleMediaRequest(post({ action: 'confirm-upload', ...auth, chapterId: 'spa', path: DAY_PATH }), deps, config, open);
    expect(res.status).toBe(400);
  });
});

describe('read-urls', () => {
  it('signiert nur Pfade, die die DB für diesen Trip freigibt – je im richtigen Bucket', async () => {
    const deps = makeDeps({
      rpc: vi.fn(async () => ({
        data: [
          { bucket: 'vienna-day', path: DAY_PATH },
          { bucket: 'vienna-memories', path: ASSET_PATH },
          { bucket: 'avatars', path: 'u1.png' },
          { bucket: 'vienna-day', path: ASSET_PATH },
        ],
        error: null,
      })),
    });
    const res = await handleMediaRequest(post({ action: 'read-urls', ...auth, paths: [DAY_PATH, ASSET_PATH, 'trips/other/day/x.jpg'] }), deps, config, open);
    const body = (await res.json()) as { urls: Record<string, string> };
    expect(Object.keys(body.urls).sort()).toEqual([ASSET_PATH, DAY_PATH].sort());
    expect(deps.createSignedUrls).toHaveBeenCalledWith('vienna-day', [DAY_PATH], expect.any(Number));
    expect(deps.createSignedUrls).toHaveBeenCalledWith('vienna-memories', [ASSET_PATH], expect.any(Number));
    expect(deps.createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it('begrenzt die Anzahl der Pfade', async () => {
    const res = await handleMediaRequest(post({ action: 'read-urls', ...auth, paths: Array.from({ length: 41 }, () => DAY_PATH) }), makeDeps(), config, open);
    expect(res.status).toBe(400);
  });
});

describe('reset', () => {
  it('ist ohne VIENNA_ALLOW_RESET gesperrt', async () => {
    const deps = makeDeps();
    const res = await handleMediaRequest(post({ action: 'reset', ...auth }), deps, config, open);
    expect(res.status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('löscht mit Freigabe nur Vienna-Tagesfotos', async () => {
    const deps = makeDeps({ rpc: vi.fn(async () => ({ data: [DAY_PATH, ASSET_PATH, 'avatars/x.png'], error: null })) });
    const res = await handleMediaRequest(post({ action: 'reset', ...auth }), deps, { ...config, allowReset: true }, open);
    expect(res.status).toBe(200);
    expect(deps.remove).toHaveBeenCalledWith('vienna-day', [DAY_PATH]);
  });
});
