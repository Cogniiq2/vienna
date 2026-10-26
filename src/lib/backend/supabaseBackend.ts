import type { SupabaseClient } from '@supabase/supabase-js';
import { isChapterId, type ChapterId, type QuestionId } from '../../config/chapters';
import { ASSET_SLOTS, type AssetSlot } from '../../config/family';
import type { Language } from '../../content';
import { normalizeProgress, normalizeResponses, type TripProgress } from '../progress';
import { BUCKET, callRpc, getSupabase, storagePaths } from '../supabaseClient';
import {
  BackendError,
  type LiveMessage,
  type RemoteAsset,
  type RemoteSnapshot,
  type RemoteUpload,
  type TripBackend,
} from './types';

export interface SnapshotRow {
  trip_id: string;
  phase: string;
  completed: string[];
  seen?: string[] | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
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
  return { progress: toProgress(row), responses, uploads, messages, assets };
}

function isInvalidToken(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes('invalid_token'));
}

/**
 * Supabase-Anbindung ohne Login:
 * 1. Anonyme Supabase-Session (pro Gerät, automatisch).
 * 2. `join_trip(token)` verknüpft diese Session mit dem Trip (Token wird serverseitig gehasht verglichen).
 * 3. Alle Schreibzugriffe über RPC-Funktionen mit Mitgliedschaftsprüfung; Tabellen sind für Clients gesperrt.
 * 4. Fotos & Familien-Assets im privaten Bucket `vienna-memories`, Zugriff per RLS nur für Mitglieder des Trips.
 */
export function createSupabaseBackend(): TripBackend {
  let tripId: string | null = null;
  const signed = new Map<string, { url: string; expires: number }>();

  async function ensureSession(sb: SupabaseClient): Promise<void> {
    const { data } = await sb.auth.getSession();
    if (data.session) return;
    const { error } = await sb.auth.signInAnonymously();
    if (error) throw new BackendError('unreachable', `auth: ${error.message}`);
  }

  function requireTrip(): string {
    if (!tripId) throw new BackendError('not-connected');
    return tripId;
  }

  return {
    mode: 'supabase',

    async connect(token, device) {
      const sb = await getSupabase('trip');
      try {
        await ensureSession(sb);
      } catch (error) {
        if (error instanceof BackendError) throw error;
        throw new BackendError('unreachable', 'auth');
      }
      const { data, error } = await callRpc(sb, 'vienna_join_trip', { p_token: token, p_device: device.slice(0, 80) });
      if (error) {
        if (isInvalidToken(error)) throw new BackendError('invalid-token');
        throw new BackendError('unreachable', error.message);
      }
      const row = data as SnapshotRow | null;
      if (!row?.trip_id) throw new BackendError('unreachable', 'empty response');
      tripId = row.trip_id;
      return toSnapshot(row);
    },

    async saveProgress(progress: TripProgress, language: Language) {
      const sb = await getSupabase('trip');
      const { data, error } = await callRpc(sb, 'vienna_save_progress', {
        p_trip_id: requireTrip(),
        p_phase: progress.phase,
        p_completed: progress.completed,
        p_seen: progress.seen,
        p_started_at: progress.startedAt,
        p_finished_at: progress.finishedAt,
        p_language: language,
      });
      if (error) throw new BackendError('unreachable', error.message);
      return toProgress(data as SnapshotRow);
    },

    async saveResponse(questionId: QuestionId, value: string, updatedAt: string) {
      const sb = await getSupabase('trip');
      const { error } = await callRpc(sb, 'vienna_save_answer', {
        p_trip_id: requireTrip(),
        p_question_id: questionId,
        p_value: value,
        p_updated_at: updatedAt,
      });
      if (error) throw new BackendError('unreachable', error.message);
    },

    async uploadPhoto(chapterId: ChapterId, blob: Blob, capturedAt: string) {
      const sb = await getSupabase('trip');
      const id = requireTrip();
      const random = crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36) ?? '0';
      const path = storagePaths.dayPhoto(id, chapterId, `${Date.now().toString(36)}${random}`);
      const { error: uploadError } = await sb.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (uploadError) throw new BackendError('unreachable', uploadError.message);

      const { data, error } = await callRpc(sb, 'vienna_record_upload', {
        p_trip_id: id,
        p_chapter_id: chapterId,
        p_path: path,
        p_captured_at: capturedAt,
      });
      if (error) throw new BackendError('unreachable', error.message);

      const previous = typeof data === 'string' ? data : null;
      if (previous && previous !== path) {
        // Ersetztes Foto aufräumen – Fehler hier sind unkritisch.
        await sb.storage.from(BUCKET).remove([previous]).catch(() => undefined);
      }
      return path;
    },

    async downloadPhoto(path: string) {
      const sb = await getSupabase('trip');
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) throw new BackendError('unreachable', error.message);
      return data;
    },

    async markMessageRead(id: string) {
      const sb = await getSupabase('trip');
      const { error } = await callRpc(sb, 'vienna_mark_message_read', { p_trip_id: requireTrip(), p_message_id: id });
      if (error) throw new BackendError('unreachable', error.message);
    },

    async assetUrl(path: string) {
      const cached = signed.get(path);
      if (cached && cached.expires > Date.now()) return cached.url;
      const sb = await getSupabase('trip');
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
      if (error) throw new BackendError('unreachable', error.message);
      signed.set(path, { url: data.signedUrl, expires: Date.now() + 1000 * 60 * 60 * 5 });
      return data.signedUrl;
    },

    async reset() {
      const sb = await getSupabase('trip');
      const { data, error } = await callRpc(sb, 'vienna_reset_trip', { p_trip_id: requireTrip() });
      if (error) throw new BackendError('unreachable', error.message);
      const paths = Array.isArray(data) ? (data as unknown[]).filter((p): p is string => typeof p === 'string') : [];
      // Zusätzlich alle Tagesfotos im Trip-Ordner entfernen (auch verwaiste). Familien-Assets bleiben.
      const folder = storagePaths.dayFolder(requireTrip());
      const { data: listed } = await sb.storage.from(BUCKET).list(folder, { limit: 1000 });
      const all = new Set([...paths, ...(listed ?? []).map((f) => `${folder}/${f.name}`)]);
      if (all.size > 0) {
        const { error: removeError } = await sb.storage.from(BUCKET).remove([...all]);
        if (removeError) throw new BackendError('unreachable', removeError.message);
      }
    },
  };
}
