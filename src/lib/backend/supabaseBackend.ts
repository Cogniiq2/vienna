import { isChapterId, type ChapterId, type QuestionId } from '../../config/chapters';
import { ASSET_SLOTS, type AssetSlot } from '../../config/family';
import type { Language } from '../../content';
import { normalizeProgress, normalizeResponses, type TripProgress } from '../progress';
import { getDeviceId } from '../deviceId';
import { env } from '../env';
import { callRpc, DAY_BUCKET, getSupabase, MEDIA_FUNCTION } from '../supabaseClient';
import {
  BackendError,
  type LiveMessage,
  type RemoteAsset,
  type RemoteSnapshot,
  type RemoteUpload,
  type TripBackend,
} from './types';

export interface SnapshotRow {
  /** Nur im Admin-Snapshot – Eltern-Snapshots enthalten keine Trip-ID. */
  trip_id?: string;
  phase: string;
  completed: string[];
  seen?: string[] | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  reset_at?: string | null;
  uploads?: Array<{ chapter_id: string; path: string; captured_at: string }> | null;
  answers?: Array<{ question_id: string; value: string; updated_at: string }> | null;
  messages?: Array<{ id: string; body: string; heart: boolean; created_at: string; read_at: string | null }> | null;
  assets?: Array<{
    slot: string;
    path: string | null;
    mime: string | null;
    caption_sr?: string | null;
    caption_de?: string | null;
    year?: string | null;
    location?: string | null;
    note?: string | null;
    updated_at?: string | null;
  }> | null;
}

export function toProgress(row: SnapshotRow): TripProgress {
  const progress = normalizeProgress({
    phase: row.phase,
    completed: row.completed,
    seen: row.seen ?? [],
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  });
  if (!progress) throw new BackendError('unreachable', 'malformed snapshot');
  return progress;
}

function isAssetSlot(value: string): value is AssetSlot {
  return (ASSET_SLOTS as readonly string[]).includes(value);
}

export function toSnapshot(row: SnapshotRow): RemoteSnapshot {
  const uploads: Partial<Record<ChapterId, RemoteUpload>> = {};
  for (const u of row.uploads ?? []) {
    if (isChapterId(u.chapter_id)) uploads[u.chapter_id] = { chapterId: u.chapter_id, path: u.path, capturedAt: u.captured_at };
  }
  const responses = normalizeResponses(
    Object.fromEntries((row.answers ?? []).map((r) => [r.question_id, { value: r.value, updatedAt: r.updated_at }])),
  );
  const messages: LiveMessage[] = (row.messages ?? [])
    .map((m) => ({ id: m.id, body: m.body, heart: Boolean(m.heart), createdAt: m.created_at, readAt: m.read_at }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const assets: Partial<Record<AssetSlot, RemoteAsset>> = {};
  for (const a of row.assets ?? []) {
    if (!isAssetSlot(a.slot)) continue;
    assets[a.slot] = {
      slot: a.slot,
      path: a.path ?? null,
      mime: a.mime ?? null,
      captionSr: a.caption_sr ?? null,
      captionDe: a.caption_de ?? null,
      year: a.year ?? null,
      location: a.location ?? null,
      note: a.note ?? null,
      updatedAt: a.updated_at ?? null,
    };
  }
  return { progress: toProgress(row), responses, uploads, messages, assets, resetAt: row.reset_at ?? null };
}

function isInvalidToken(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes('invalid_token'));
}

interface MediaUploadTicket {
  bucket: string;
  path: string;
  uploadToken: string;
}

/** Signierte Lese-URLs gelten 6 h; wir erneuern nach 5 h. */
const SIGNED_TTL_MS = 1000 * 60 * 60 * 5;

/**
 * Supabase-Anbindung ohne jede Anmeldung (keine Anonymous Sign-ins):
 * 1. Jeder RPC-Aufruf trägt Trip-Token + lokale Geräte-ID; die Datenbank prüft den Token (SHA-256-Hash).
 * 2. Tabellen sind für Clients komplett gesperrt – nur die Vienna-RPCs sind erreichbar.
 * 3. Fotos laufen über die Edge Function `vienna-media`: Sie erzeugt den Upload-Pfad serverseitig,
 *    stellt eine signierte Upload-URL aus und liefert kurzlebige Lese-URLs nur für Pfade dieses Trips.
 *    Der Service-Role-Key existiert ausschließlich in der Edge Function.
 */
export function createSupabaseBackend(): TripBackend {
  let token: string | null = null;
  const signed = new Map<string, { url: string; expires: number }>();

  function auth(): { p_token: string; p_device_id: string } {
    if (!token) throw new BackendError('not-connected');
    return { p_token: token, p_device_id: getDeviceId() };
  }

  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const sb = await getSupabase('trip');
    const { data, error } = await callRpc(sb, fn, { ...auth(), ...args });
    if (error) {
      if (isInvalidToken(error)) throw new BackendError('invalid-token');
      throw new BackendError('unreachable', error.message);
    }
    return data;
  }

  async function media<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    if (!token) throw new BackendError('not-connected');
    let res: Response;
    try {
      res = await fetch(`${env.supabaseUrl}/functions/v1/${MEDIA_FUNCTION}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: env.supabaseAnonKey },
        body: JSON.stringify({ action, token, deviceId: getDeviceId(), ...payload }),
      });
    } catch {
      throw new BackendError('unreachable', 'media: network');
    }
    if (res.status === 401) throw new BackendError('invalid-token');
    if (!res.ok) throw new BackendError('unreachable', `media: ${res.status}`);
    return (await res.json()) as T;
  }

  /** Signierte URLs für mehrere Pfade (gecacht). Unbekannte/fremde Pfade bekommen keine URL. */
  async function signedUrls(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const missing: string[] = [];
    for (const p of new Set(paths)) {
      const cached = signed.get(p);
      if (cached && cached.expires > Date.now()) out.set(p, cached.url);
      else missing.push(p);
    }
    for (let i = 0; i < missing.length; i += 40) {
      const { urls } = await media<{ urls: Record<string, string> }>('read-urls', { paths: missing.slice(i, i + 40) });
      for (const [p, url] of Object.entries(urls ?? {})) {
        signed.set(p, { url, expires: Date.now() + SIGNED_TTL_MS });
        out.set(p, url);
      }
    }
    return out;
  }

  return {
    mode: 'supabase',

    async connect(tripToken, device) {
      token = tripToken;
      const sb = await getSupabase('trip');
      const { data, error } = await callRpc(sb, 'vienna_join_trip', { ...auth(), p_device: device.slice(0, 80) });
      if (error) {
        if (isInvalidToken(error)) throw new BackendError('invalid-token');
        throw new BackendError('unreachable', error.message);
      }
      const row = data as SnapshotRow | null;
      if (!row?.phase) throw new BackendError('unreachable', 'empty response');
      return toSnapshot(row);
    },

    async saveProgress(progress: TripProgress, language: Language) {
      const data = await rpc('vienna_save_progress', {
        p_phase: progress.phase,
        p_completed: progress.completed,
        p_seen: progress.seen,
        p_started_at: progress.startedAt,
        p_finished_at: progress.finishedAt,
        p_language: language,
      });
      return toProgress(data as SnapshotRow);
    },

    async saveResponse(questionId: QuestionId, value: string, updatedAt: string) {
      await rpc('vienna_save_answer', { p_question_id: questionId, p_value: value, p_updated_at: updatedAt });
    },

    async uploadPhoto(chapterId: ChapterId, blob: Blob, capturedAt: string) {
      // 1. Server erzeugt Pfad + Ticket, 2. Datei direkt in den privaten Bucket, 3. Server bestätigt.
      const ticket = await media<MediaUploadTicket>('upload-url', { chapterId });
      if (ticket.bucket !== DAY_BUCKET || !ticket.path || !ticket.uploadToken) throw new BackendError('unreachable', 'media: ticket');
      const sb = await getSupabase('trip');
      const { error } = await sb.storage
        .from(DAY_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw new BackendError('unreachable', `upload: ${error.message}`);
      await media('confirm-upload', { chapterId, path: ticket.path, capturedAt });
      return ticket.path;
    },

    async downloadPhoto(path: string) {
      const url = (await signedUrls([path])).get(path);
      if (!url) throw new BackendError('unreachable', 'photo not available');
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) throw new BackendError('unreachable', 'photo download');
      return res.blob();
    },

    async markMessageRead(id: string) {
      await rpc('vienna_mark_message_read', { p_message_id: id });
    },

    async assetUrl(path: string) {
      const url = (await signedUrls([path])).get(path);
      if (!url) throw new BackendError('unreachable', 'asset not available');
      return url;
    },

    async reset() {
      // Nur möglich, wenn die Edge Function mit VIENNA_ALLOW_RESET=true läuft (Testphase).
      await media('reset', {});
      signed.clear();
    },
  };
}
