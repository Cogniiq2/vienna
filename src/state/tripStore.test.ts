import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterId, QuestionId } from '../config/chapters';
import { BackendError, type LiveMessage, type RemoteAsset, type RemoteSnapshot, type TripBackend } from '../lib/backend';
import { photoStore } from '../lib/photoStore';
import { mergeProgress, progressAtStep, stepIndexOfChapter, type TripProgress } from '../lib/progress';
import { TripStore } from './tripStore';

/** In-Memory-„Server“, der Netzprobleme simulieren kann. */
class FakeBackend implements TripBackend {
  readonly mode = 'supabase' as const;
  online = true;
  invalid = false;
  progress: TripProgress = { phase: 'opening', completed: [], seen: [], startedAt: null, finishedAt: null, updatedAt: new Date(0).toISOString() };
  responses: Record<string, { value: string; updatedAt: string }> = {};
  uploads: Partial<Record<ChapterId, { path: string; capturedAt: string }>> = {};
  uploadCalls = 0;
  messages: LiveMessage[] = [];
  assets: RemoteSnapshot['assets'] = {};
  devices: string[] = [];

  private check() {
    if (!this.online) throw new BackendError('unreachable', 'offline');
  }
  connect(_token: string, device: string): Promise<RemoteSnapshot> {
    if (this.invalid) return Promise.reject(new BackendError('invalid-token'));
    this.check();
    this.devices.push(device);
    const uploads: RemoteSnapshot['uploads'] = {};
    for (const [id, u] of Object.entries(this.uploads)) uploads[id as ChapterId] = { chapterId: id as ChapterId, ...u };
    return Promise.resolve({
      progress: this.progress,
      responses: { ...this.responses },
      uploads,
      messages: this.messages.map((m) => ({ ...m })),
      assets: { ...this.assets },
    });
  }
  saveProgress(p: TripProgress) {
    this.check();
    this.progress = mergeProgress(this.progress, p);
    return Promise.resolve(this.progress);
  }
  saveResponse(q: QuestionId, value: string, updatedAt: string) {
    this.check();
    this.responses[q] = { value, updatedAt };
    return Promise.resolve();
  }
  uploadPhoto(id: ChapterId, _blob: Blob, capturedAt: string) {
    this.uploadCalls++;
    this.check();
    const path = `trip/${id}-${this.uploadCalls}.jpg`;
    this.uploads[id] = { path, capturedAt };
    return Promise.resolve(path);
  }
  downloadPhoto() {
    return Promise.resolve(new Blob(['x'], { type: 'image/jpeg' }));
  }
  markMessageRead(id: string) {
    this.check();
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m));
    return Promise.resolve();
  }
  assetUrl(path: string) {
    this.check();
    return Promise.resolve(`https://signed.example/${path}?token=x`);
  }
  reset() {
    this.progress = { ...this.progress, phase: 'opening', completed: [] };
    this.uploads = {};
    this.responses = {};
    return Promise.resolve();
  }
}

const image = () => ({ blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), width: 10, height: 10 });

let token = 0;
const nextToken = () => `test-token-${++token}-xxxxxxxxxxxxxxxxxxxx`;

describe('TripStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('works fully offline-first and syncs queued photos once the network returns', async () => {
    const backend = new FakeBackend();
    backend.online = false;
    const key = nextToken();
    const store = new TripStore(key, backend);
    await store.init();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().connection).toBe('unreachable');

    store.advanceTo('journey');
    await store.savePhoto('morning', image());
    store.completeChapter('morning');
    expect(store.getState().photos.morning?.status).toBe('pending');
    expect(store.getState().progress.completed).toEqual(['morning']);

    backend.online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(store.getState().photos.morning?.status).toBe('synced'));
    await vi.waitFor(() => expect(store.getState().pending).toBe(false));
    expect(backend.progress.completed).toEqual(['morning']);
    expect(backend.uploads.morning?.path).toBe(store.getState().photos.morning?.remotePath);
    store.dispose();
  });

  it('restores progress after a reload from local storage', async () => {
    const key = nextToken();
    const backend = new FakeBackend();
    const first = new TripStore(key, backend);
    await first.init();
    first.advanceTo('journey');
    first.completeChapter('morning');
    first.setResponse('dinner.moment', 'Шетња');
    first.dispose();

    backend.online = false;
    const second = new TripStore(key, backend);
    await second.init();
    expect(second.getState().progress.completed).toEqual(['morning']);
    expect(second.getState().responses['dinner.moment']?.value).toBe('Шетња');
    second.dispose();
  });

  it('adopts progress from the other parent’s phone on a fresh device', async () => {
    const backend = new FakeBackend();
    backend.progress = progressAtStep(stepIndexOfChapter('tennis') + 1);
    backend.uploads.morning = { path: 'trip/morning-x.jpg', capturedAt: new Date().toISOString() };
    const store = new TripStore(nextToken(), backend);
    await store.init();
    expect(store.getState().progress.completed).toEqual(['morning', 'mission', 'tennis']);
    expect(store.getState().photos.morning).toMatchObject({ status: 'remote', hasLocal: false });
    expect(await store.getPhotoBlob('morning')).toBeInstanceOf(Blob);
    store.dispose();
  });

  it('marks an unknown trip link as invalid', async () => {
    const backend = new FakeBackend();
    backend.invalid = true;
    const store = new TripStore(nextToken(), backend);
    await store.init();
    expect(store.getState().status).toBe('invalid');
    store.dispose();
  });

  it('resets everything locally and remotely', async () => {
    const key = nextToken();
    const backend = new FakeBackend();
    const store = new TripStore(key, backend);
    await store.init();
    store.advanceTo('journey');
    await store.savePhoto('morning', image());
    store.completeChapter('morning');
    await store.sync();
    await store.resetAll();
    expect(store.getState().progress.phase).toBe('opening');
    expect(store.getState().photos).toEqual({});
    expect(await photoStore.list(key)).toEqual([]);
    expect(backend.uploads).toEqual({});
    store.dispose();
  });

  it('delivers live messages on the next sync and marks them read on the server', async () => {
    const backend = new FakeBackend();
    const store = new TripStore(nextToken(), backend);
    await store.init();
    expect(store.getState().messages).toEqual([]);
    backend.messages = [{ id: 'm1', body: 'Видимо да сте преживели тенис 😄', heart: true, createdAt: new Date().toISOString(), readAt: null }];
    await store.refresh();
    expect(store.getState().messages[0]?.body).toContain('тенис');
    store.markMessageRead('m1');
    expect(store.getState().messages[0]?.readAt).not.toBeNull();
    await vi.waitFor(() => expect(backend.messages[0]?.readAt).not.toBeNull());
    expect(backend.devices[0]).toMatch(/ · /);
    store.dispose();
  });

  it('keeps a message read locally even while offline', async () => {
    const backend = new FakeBackend();
    backend.messages = [{ id: 'm2', body: 'Hallo', heart: false, createdAt: new Date().toISOString(), readAt: null }];
    const key = nextToken();
    const store = new TripStore(key, backend);
    await store.init();
    backend.online = false;
    store.markMessageRead('m2');
    store.dispose();
    backend.online = true;
    const again = new TripStore(key, backend);
    await again.init();
    await vi.waitFor(() => expect(backend.messages[0]?.readAt).not.toBeNull());
    expect(again.getState().messages[0]?.readAt).not.toBeNull();
    again.dispose();
  });

  it('resolves private family assets via signed URLs and never fails for missing ones', async () => {
    const backend = new FakeBackend();
    const meta = { captionSr: null, captionDe: null, year: null, location: null, note: null, updatedAt: null };
    const wedding: RemoteAsset = { slot: 'wedding', path: 'trip/wedding-1.jpg', mime: 'image/jpeg', ...meta };
    const gradskiKlub: RemoteAsset = { slot: 'gradskiKlub', path: null, mime: null, ...meta, captionSr: 'Градски клуб, Ниш', year: '1989' };
    backend.assets = { wedding, gradskiKlub };
    const store = new TripStore(nextToken(), backend);
    await store.init();
    expect(store.hasAsset('wedding')).toBe(true);
    expect(await store.getAssetUrl('wedding')).toContain('signed.example/trip/wedding-1.jpg');
    // Nur Metadaten, noch keine Datei → nicht vorhanden, aber Bildunterschrift aus der DB hat Vorrang.
    expect(store.hasAsset('gradskiKlub')).toBe(false);
    expect(await store.getAssetUrl('gradskiKlub')).toBeNull();
    expect(await store.getAssetBlob('gradskiKlub')).toBeNull();
    expect(store.getAssetMeta('gradskiKlub', 'sr')).toEqual({ caption: 'Градски клуб, Ниш', year: '1989', location: null });
    expect(store.getAssetMeta('gradskiKlub', 'de').caption).toBe('Gradski Klub');
    expect(store.hasAsset('familyCurrent')).toBe(false);
    store.dispose();
  });

  it('remembers seen memories and syncs them', async () => {
    const backend = new FakeBackend();
    const store = new TripStore(nextToken(), backend);
    await store.init();
    store.advanceTo('journey');
    store.markSeen('interlude:gradskiKlub');
    await vi.waitFor(() => expect(backend.progress.seen).toContain('interlude:gradskiKlub'));
    store.dispose();
  });
});
