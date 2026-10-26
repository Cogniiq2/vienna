import { CHAPTER_IDS, type ChapterId, type QuestionId } from '../config/chapters';
import { family, PHOTO_SLOTS, type AssetSlot, type PhotoSlot } from '../config/family';
import type { Language } from '../content';
import { BackendError, type LiveMessage, type RemoteAsset, type RemoteSnapshot, type TripBackend } from '../lib/backend';
import { photoStore, toMeta, type PhotoMeta, type StoredPhoto } from '../lib/photoStore';
import {
  advancePhase,
  completeChapter as completeChapterPure,
  initialProgress,
  markSeen as markSeenPure,
  mergeProgress,
  mergeResponses,
  normalizeProgress,
  normalizeResponses,
  phaseRank,
  progressEquals,
  type Phase,
  type Responses,
  type TripProgress,
} from '../lib/progress';
import { safeStorage } from '../lib/safeStorage';

export type Connection = 'local' | 'connecting' | 'online' | 'unreachable';

/** Foto-Zustand pro Kapitel, wie ihn die UI braucht. */
export interface PhotoEntry {
  chapterId: ChapterId;
  capturedAt: string;
  status: 'pending' | 'synced' | 'local' | 'remote';
  /** Pfad im Storage, falls hochgeladen. */
  remotePath: string | null;
  /** Liegt das Foto auf diesem Gerät (IndexedDB)? */
  hasLocal: boolean;
}

export interface TripState {
  status: 'loading' | 'ready' | 'invalid';
  progress: TripProgress;
  responses: Responses;
  photos: Partial<Record<ChapterId, PhotoEntry>>;
  connection: Connection;
  /** Es gibt lokale Änderungen, die noch nicht am Server sind. */
  pending: boolean;
  /** Nachrichten der Kinder (aus dem Admin-Dashboard), älteste zuerst. */
  messages: LiveMessage[];
  /** Im Dashboard hochgeladene Familien-Assets. */
  assets: Partial<Record<AssetSlot, RemoteAsset>>;
}

interface LocalSnapshot {
  progress: TripProgress;
  progressDirty: boolean;
  responses: Responses;
  dirtyResponses: QuestionId[];
  /** Lokal als gelesen markierte Nachrichten (überlebt Offline-Phasen). */
  readMessages: string[];
  pendingReads: string[];
}

const RETRY_MS = 15_000;
/** Wie oft der Server nach Neuigkeiten gefragt wird (Nachrichten, zweites Handy). */
const POLL_MS = 30_000;

/** Kurzes, nicht identifizierendes Gerätelabel fürs Dashboard, z. B. "iPhone · Safari". */
export function deviceLabel(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Gerät';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  return `${device} · ${browser}`;
}
const CONNECT_WAIT_MS = 4_000;

/**
 * Zentrale, framework-unabhängige Zustandsverwaltung für einen Trip.
 *
 * Prinzip "local first, server = source of truth":
 * - Jede Aktion wird sofort lokal gespeichert (localStorage + IndexedDB) und angezeigt.
 * - Danach wird mit dem Server synchronisiert. Fortschritt wird monoton zusammengeführt,
 *   Antworten nach Zeitstempel, Fotos nach Aufnahmezeit.
 * - Schlägt etwas fehl (Stadion, Funkloch), bleibt es als "pending" markiert und wird bei
 *   `online`, beim Zurückkehren in den Tab und alle 15 s erneut versucht.
 */
export class TripStore {
  private state: TripState;
  private listeners = new Set<() => void>();
  private local: LocalSnapshot;
  private syncing: Promise<void> | null = null;
  private syncAgain = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private debugAssets = new Map<AssetSlot, string>();
  private connected = false;
  private disposed = false;
  private language: Language = 'sr';
  private readonly storageKey: string;

  constructor(
    private readonly tripKey: string,
    private readonly backend: TripBackend,
  ) {
    this.storageKey = `vienna:trip:${tripKey}`;
    this.local = this.readLocal();
    this.state = {
      status: 'loading',
      progress: this.local.progress,
      responses: this.local.responses,
      photos: {},
      connection: backend.mode === 'local' ? 'local' : 'connecting',
      pending: this.local.progressDirty || this.local.dirtyResponses.length > 0,
      messages: [],
      assets: {},
    };
  }

  // ---------------------------------------------------------------------------
  // Subscription (für useSyncExternalStore)
  // ---------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): TripState => this.state;

  private setState(patch: Partial<TripState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    this.disposed = false;
    const photos = await this.loadLocalPhotos();
    this.setState({ photos });

    const hasLocalProgress = this.local.progress.phase !== 'opening' || this.local.progress.completed.length > 0;
    const connecting = this.connect();

    if (this.backend.mode === 'local' || hasLocalProgress) {
      this.setState({ status: 'ready' });
    } else {
      // Neues Gerät: kurz auf den Server warten, damit z. B. Papas Handy nicht beim Opening startet,
      // wenn Mama schon bei Kapitel 3 ist. Offline → nach Timeout lokal starten.
      await Promise.race([connecting, new Promise((r) => setTimeout(r, CONNECT_WAIT_MS))]);
      if (this.state.status === 'loading') this.setState({ status: 'ready' });
    }

    window.addEventListener('online', this.handleWake);
    document.addEventListener('visibilitychange', this.handleVisibility);
    if (this.backend.mode === 'supabase' && !this.pollTimer) {
      this.pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine !== false) void this.refresh();
      }, POLL_MS);
    }
    await connecting;
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('online', this.handleWake);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.stopRetry();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  setLanguage(language: Language): void {
    if (this.language === language) return;
    this.language = language;
  }

  private handleWake = () => {
    if (this.connected) void this.refresh();
    else void this.connect();
  };

  /** Neuigkeiten vom Server holen (Nachrichten, Fortschritt vom anderen Handy) und ausstehendes senden. */
  async refresh(): Promise<void> {
    if (this.backend.mode === 'local') return;
    if (!this.connected) return this.connect();
    try {
      const snapshot = await this.backend.connect(this.tripKey, deviceLabel());
      if (snapshot) await this.applySnapshot(snapshot);
      if (this.state.connection !== 'online') this.setState({ connection: 'online' });
    } catch (error) {
      if (error instanceof BackendError && error.code === 'invalid-token') {
        this.setState({ status: 'invalid' });
        return;
      }
      this.setState({ connection: 'unreachable' });
    }
    await this.sync();
  }

  private handleVisibility = () => {
    if (document.visibilityState === 'visible') this.handleWake();
  };

  private connectPromise: Promise<void> | null = null;

  private connect(): Promise<void> {
    if (this.backend.mode === 'local') return Promise.resolve();
    this.connectPromise ??= this.runConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async runConnect(): Promise<void> {
    this.setState({ connection: 'connecting' });
    try {
      const snapshot = await this.backend.connect(this.tripKey, deviceLabel());
      if (snapshot) await this.applySnapshot(snapshot);
      this.connected = true;
      this.setState({ connection: 'online' });
      await this.sync();
    } catch (error) {
      if (error instanceof BackendError && error.code === 'invalid-token') {
        this.setState({ status: 'invalid', connection: 'unreachable' });
        return;
      }
      this.setState({ connection: 'unreachable' });
      this.ensureRetry();
    }
  }

  /**
   * Nach einem Test-Reset am Server: lokalen Stand verwerfen, der VOR dem Reset entstanden ist –
   * sonst würde ein altes Testhandy den frischen Trip per monotonem Merge wieder „auffüllen“.
   * Was offline NACH dem Reset entstand, bleibt erhalten.
   */
  private async discardStateBefore(resetAt: string | null): Promise<void> {
    const cutoff = resetAt ? Date.parse(resetAt) : NaN;
    if (Number.isNaN(cutoff)) return;
    const older = (iso: string) => Date.parse(iso) < cutoff;
    let { progress, progressDirty } = this.local;
    if (older(progress.updatedAt)) {
      progress = initialProgress(resetAt ?? undefined);
      progressDirty = false;
    }
    const responses = Object.fromEntries(Object.entries(this.local.responses).filter(([, e]) => e && !older(e.updatedAt)));
    const dirtyResponses = this.local.dirtyResponses.filter((q) => q in responses);
    this.local = { ...this.local, progress, progressDirty, responses, dirtyResponses };
    const photos = { ...this.state.photos };
    for (const chapterId of CHAPTER_IDS) {
      const photo = photos[chapterId];
      if (photo && older(photo.capturedAt)) {
        await photoStore.remove(this.tripKey, chapterId);
        delete photos[chapterId];
      }
    }
    this.setState({ photos });
  }

  private async applySnapshot(remote: RemoteSnapshot): Promise<void> {
    await this.discardStateBefore(remote.resetAt);
    const merged = mergeProgress(this.local.progress, remote.progress);
    const progressDirty = !progressEquals(merged, remote.progress);

    const responses = mergeResponses(remote.responses, this.local.responses);
    const dirtyResponses = this.local.dirtyResponses.filter((q) => {
      const localEntry = this.local.responses[q];
      const remoteEntry = remote.responses[q];
      return localEntry && (!remoteEntry || Date.parse(localEntry.updatedAt) > Date.parse(remoteEntry.updatedAt));
    });

    this.local = { ...this.local, progress: merged, progressDirty, responses, dirtyResponses };
    this.writeLocal();
    const read = new Set(this.local.readMessages);
    const messages = remote.messages.map((m) => (read.has(m.id) && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m));

    const photos = { ...this.state.photos };
    for (const chapterId of CHAPTER_IDS) {
      const upload = remote.uploads[chapterId];
      const current = photos[chapterId];
      if (!upload) continue;
      if (!current) {
        photos[chapterId] = { chapterId, capturedAt: upload.capturedAt, status: 'remote', remotePath: upload.path, hasLocal: false };
        continue;
      }
      if (current.remotePath === upload.path) {
        if (current.status === 'pending') {
          photos[chapterId] = { ...current, status: 'synced' };
          await photoStore.update(this.tripKey, chapterId, { status: 'synced' });
        }
        continue;
      }
      // Anderes Gerät hat ein neueres Foto für dieses Kapitel hochgeladen.
      if (Date.parse(upload.capturedAt) > Date.parse(current.capturedAt) && current.status !== 'pending') {
        await photoStore.remove(this.tripKey, chapterId);
        photos[chapterId] = { chapterId, capturedAt: upload.capturedAt, status: 'remote', remotePath: upload.path, hasLocal: false };
      }
    }

    this.setState({
      progress: merged,
      responses,
      photos,
      messages,
      assets: remote.assets,
      pending: progressDirty || dirtyResponses.length > 0 || this.hasPendingPhotos(photos),
    });
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------

  advanceTo(phase: Phase): void {
    this.updateProgress(advancePhase(this.state.progress, phase));
  }

  completeChapter(chapterId: ChapterId): void {
    this.updateProgress(completeChapterPure(this.state.progress, chapterId));
  }

  /** Interlude / Finale-Station als gesehen vermerken. */
  markSeen(key: string): void {
    this.updateProgress(markSeenPure(this.state.progress, key));
  }

  markMessageRead(id: string): void {
    const now = new Date().toISOString();
    this.local = {
      ...this.local,
      readMessages: [...new Set([...this.local.readMessages, id])],
      pendingReads: this.backend.mode === 'supabase' ? [...new Set([...this.local.pendingReads, id])] : [],
    };
    this.writeLocal();
    this.setState({ messages: this.state.messages.map((m) => (m.id === id ? { ...m, readAt: m.readAt ?? now } : m)) });
    void this.sync();
  }

  /**
   * Anzeigbare URL eines Familien-Assets oder null, wenn keines vorhanden ist.
   * Reihenfolge: Debug-Simulation → im Dashboard hochgeladen (signiert, privat) → `src` aus family.ts.
   */
  async getAssetUrl(slot: AssetSlot): Promise<string | null> {
    const debug = this.debugAssets.get(slot);
    if (debug) return debug;
    const remote = this.state.assets[slot];
    if (remote?.path && this.backend.mode === 'supabase') {
      try {
        return await this.backend.assetUrl(remote.path);
      } catch {
        /* Fallback auf src */
      }
    }
    return configuredAssetSrc(slot);
  }

  /** Gibt es (vermutlich) ein Asset für diesen Slot? Synchron, für die Darstellung. */
  hasAsset(slot: AssetSlot): boolean {
    return this.debugAssets.has(slot) || Boolean(this.state.assets[slot]?.path) || Boolean(configuredAssetSrc(slot));
  }

  /**
   * Bildunterschrift & Co. eines Familienfotos. Priorität: im Admin gepflegt → Default aus family.ts → leer.
   */
  getAssetMeta(slot: AssetSlot, lang: Language): { caption: string | null; year: string | null; location: string | null } {
    const remote = this.state.assets[slot];
    const fallback = (PHOTO_SLOTS as readonly string[]).includes(slot) ? family.memoryAssets[slot as PhotoSlot] : null;
    const remoteCaption = lang === 'sr' ? remote?.captionSr : remote?.captionDe;
    return {
      caption: remoteCaption || (fallback?.caption ? fallback.caption[lang] : null),
      year: remote?.year || fallback?.year || null,
      location: remote?.location || fallback?.location || null,
    };
  }

  /** Asset als Blob (für das PDF). Fehlt es oder schlägt der Download fehl → null, nie ein Fehler. */
  async getAssetBlob(slot: AssetSlot): Promise<Blob | null> {
    try {
      const url = await this.getAssetUrl(slot);
      if (!url) return null;
      const res = await fetch(url);
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  }

  setResponse(questionId: QuestionId, value: string): void {
    const entry = { value: value.slice(0, 2000), updatedAt: new Date().toISOString() };
    const responses = { ...this.state.responses, [questionId]: entry };
    const dirty = new Set(this.local.dirtyResponses).add(questionId);
    this.local = { ...this.local, responses, dirtyResponses: [...dirty] };
    this.writeLocal();
    this.setState({ responses, pending: true });
  }

  /** Speichert ein (bereits komprimiertes) Foto lokal und stößt den Upload an. */
  async savePhoto(chapterId: ChapterId, image: { blob: Blob; width: number; height: number }): Promise<void> {
    const capturedAt = new Date().toISOString();
    const status = this.backend.mode === 'local' ? 'local' : 'pending';
    const record: StoredPhoto = {
      tripKey: this.tripKey,
      chapterId,
      bytes: await image.blob.arrayBuffer(),
      mimeType: image.blob.type || 'image/jpeg',
      width: image.width,
      height: image.height,
      capturedAt,
      status,
      remotePath: null,
    };
    await photoStore.put(record);
    this.setState({
      photos: { ...this.state.photos, [chapterId]: this.entryFromMeta(toMeta(record)) },
      pending: this.backend.mode !== 'local' || this.state.pending,
    });
    void this.sync();
  }

  /** Foto als Blob – lokal bevorzugt, sonst vom Server (z. B. Foto vom anderen Handy). */
  async getPhotoBlob(chapterId: ChapterId): Promise<Blob | null> {
    const stored = await photoStore.get(this.tripKey, chapterId);
    if (stored) return new Blob([stored.bytes], { type: stored.mimeType });
    const entry = this.state.photos[chapterId];
    if (!entry?.remotePath || this.backend.mode === 'local') return null;
    if (!this.connected) await this.connect();
    try {
      return await this.backend.downloadPhoto(entry.remotePath);
    } catch {
      return null;
    }
  }

  /** Debug/Reset: alles für diesen Trip löschen – lokal und (falls verbunden) am Server. */
  async resetAll(): Promise<void> {
    if (this.backend.mode === 'supabase') {
      if (!this.connected) await this.connect();
      await this.backend.reset();
    }
    await photoStore.clearTrip(this.tripKey);
    safeStorage.remove(this.storageKey);
    safeStorage.remove(`${this.storageKey}:privacy`);
    safeStorage.remove(`${this.storageKey}:finale`);
    this.local = {
      progress: initialProgress(),
      progressDirty: false,
      responses: {},
      dirtyResponses: [],
      readMessages: [],
      pendingReads: [],
    };
    this.setState({ progress: this.local.progress, responses: {}, photos: {}, pending: false, messages: [] });
  }

  /** Debug: simuliertes Asset (z. B. erzeugtes Audio/Video) – nur im Speicher. */
  debugSetAsset(slot: AssetSlot, url: string): void {
    this.debugAssets.set(slot, url);
    this.setState({ assets: { ...this.state.assets } });
  }

  /** Debug: eine Nachricht so anzeigen, als käme sie aus dem Dashboard. */
  debugAddMessage(body: string): void {
    const message: LiveMessage = { id: `debug-${Date.now()}`, body, heart: true, createdAt: new Date().toISOString(), readAt: null };
    this.setState({ messages: [...this.state.messages, message] });
  }

  /** Debug: Fortschritt hart setzen (ohne Merge). */
  async debugSetProgress(progress: TripProgress): Promise<void> {
    if (this.backend.mode === 'supabase' && this.connected) {
      // Server-Merge ist monoton – für Rücksprünge erst zurücksetzen.
      const goingBack =
        this.state.progress.completed.some((id) => !progress.completed.includes(id)) ||
        phaseRank(progress.phase) < phaseRank(this.state.progress.phase);
      if (goingBack) await this.backend.reset();
    }
    this.local = { ...this.local, progress, progressDirty: true };
    this.writeLocal();
    this.setState({ progress, pending: true });
    await this.sync();
  }

  /** Kleine, nur lokal relevante Merker (z. B. Privacy-Hinweis gesehen, Finale gesehen). */
  getFlag(name: 'privacy' | 'finale'): boolean {
    return safeStorage.get(`${this.storageKey}:${name}`) === '1';
  }

  setFlag(name: 'privacy' | 'finale'): void {
    safeStorage.set(`${this.storageKey}:${name}`, '1');
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  private updateProgress(next: TripProgress) {
    if (next === this.state.progress) return;
    this.local = { ...this.local, progress: next, progressDirty: true };
    this.writeLocal();
    this.setState({ progress: next, pending: this.backend.mode !== 'local' });
    void this.sync();
  }

  sync(): Promise<void> {
    if (this.backend.mode === 'local') return Promise.resolve();
    if (this.syncing) {
      this.syncAgain = true;
      return this.syncing;
    }
    this.syncing = this.runSync().finally(() => {
      this.syncing = null;
      if (this.syncAgain) {
        this.syncAgain = false;
        void this.sync();
      }
    });
    return this.syncing;
  }

  private async runSync(): Promise<void> {
    if (!this.connected) {
      this.ensureRetry();
      return;
    }
    let failed = false;

    if (this.local.progressDirty) {
      try {
        const sent = this.local.progress;
        const server = await this.backend.saveProgress(sent, this.language);
        if (server) {
          const merged = mergeProgress(this.local.progress, server);
          const stillDirty = this.local.progress !== sent;
          this.local = { ...this.local, progress: merged, progressDirty: stillDirty };
          this.writeLocal();
          if (!progressEquals(merged, this.state.progress)) this.setState({ progress: merged });
        }
      } catch {
        failed = true;
      }
    }

    for (const questionId of [...this.local.dirtyResponses]) {
      const entry = this.local.responses[questionId];
      if (!entry) continue;
      try {
        await this.backend.saveResponse(questionId, entry.value, entry.updatedAt);
        if (this.local.responses[questionId] === entry) {
          this.local = { ...this.local, dirtyResponses: this.local.dirtyResponses.filter((q) => q !== questionId) };
          this.writeLocal();
        }
      } catch {
        failed = true;
      }
    }

    for (const id of [...this.local.pendingReads]) {
      try {
        await this.backend.markMessageRead(id);
        this.local = { ...this.local, pendingReads: this.local.pendingReads.filter((r) => r !== id) };
        this.writeLocal();
      } catch {
        failed = true;
      }
    }

    const stored = await photoStore.list(this.tripKey);
    for (const photo of stored.filter((p) => p.status === 'pending')) {
      try {
        const blob = new Blob([photo.bytes], { type: photo.mimeType });
        const path = await this.backend.uploadPhoto(photo.chapterId, blob, photo.capturedAt);
        // Wurde inzwischen ein neueres Foto aufgenommen, nicht überschreiben.
        const latest = await photoStore.get(this.tripKey, photo.chapterId);
        if (latest?.capturedAt === photo.capturedAt) {
          await photoStore.update(this.tripKey, photo.chapterId, { status: 'synced', remotePath: path });
          const current = this.state.photos[photo.chapterId];
          if (current?.capturedAt === photo.capturedAt) {
            this.setState({
              photos: { ...this.state.photos, [photo.chapterId]: { ...current, status: 'synced', remotePath: path } },
            });
          }
        }
      } catch {
        failed = true;
      }
    }

    const pending = this.local.progressDirty || this.local.dirtyResponses.length > 0 || this.hasPendingPhotos(this.state.photos);
    this.setState({ pending, connection: failed ? 'unreachable' : 'online' });
    if (pending) this.ensureRetry();
    else this.stopRetry();
  }

  private ensureRetry() {
    if (this.retryTimer || this.disposed || this.backend.mode === 'local') return;
    this.retryTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      this.handleWake();
    }, RETRY_MS);
  }

  private stopRetry() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  private hasPendingPhotos(photos: TripState['photos']): boolean {
    return Object.values(photos).some((p) => p?.status === 'pending');
  }

  // ---------------------------------------------------------------------------
  // Lokale Persistenz
  // ---------------------------------------------------------------------------

  private readLocal(): LocalSnapshot {
    const raw = safeStorage.getJson<Record<string, unknown>>(this.storageKey);
    const progress = normalizeProgress(raw?.progress) ?? initialProgress();
    const responses = normalizeResponses(raw?.responses);
    const dirtyRaw = Array.isArray(raw?.dirtyResponses) ? (raw.dirtyResponses as unknown[]) : [];
    return {
      progress,
      progressDirty: raw?.progressDirty === true,
      responses,
      dirtyResponses: dirtyRaw.filter((q): q is QuestionId => typeof q === 'string' && q in responses),
      readMessages: stringList(raw?.readMessages),
      pendingReads: stringList(raw?.pendingReads),
    };
  }

  private writeLocal() {
    safeStorage.setJson(this.storageKey, this.local);
  }

  private async loadLocalPhotos(): Promise<TripState['photos']> {
    const photos: TripState['photos'] = {};
    try {
      for (const p of await photoStore.list(this.tripKey)) photos[p.chapterId] = this.entryFromMeta(toMeta(p));
    } catch {
      /* IndexedDB nicht verfügbar – Fotos kommen dann ggf. vom Server */
    }
    return photos;
  }

  private entryFromMeta(meta: PhotoMeta): PhotoEntry {
    return {
      chapterId: meta.chapterId,
      capturedAt: meta.capturedAt,
      status: meta.status,
      remotePath: meta.remotePath,
      hasLocal: true,
    };
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(-200) : [];
}

function configuredAssetSrc(slot: AssetSlot): string | null {
  switch (slot) {
    case 'familyVideo':
      return family.familyVideo.src;
    case 'videoPoster':
      return family.familyVideo.poster;
    case 'audioDjordje':
    case 'audioBogdana':
    case 'audioLazar':
      return family.familyMessages.find((m) => m.slot === slot)?.src ?? null;
    default:
      return family.memoryAssets[slot].src;
  }
}
