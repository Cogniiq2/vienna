import type { SupabaseClient } from '@supabase/supabase-js';
import { isChapterId, type ChapterId, type QuestionId } from '../../config/chapters';
import type { Language } from '../../content';
import { normalizeProgress, normalizeResponses, type TripProgress } from '../progress';
import { BackendError, type RemoteSnapshot, type RemoteUpload, type TripBackend } from './types';

export const PHOTO_BUCKET = 'memories';

interface SnapshotRow {
  trip_id: string;
  phase: string;
  completed: string[];
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  uploads?: Array<{ chapter_id: string; path: string; captured_at: string }>;
  responses?: Array<{ question_id: string; value: string; updated_at: string }>;
}

function toProgress(row: SnapshotRow): TripProgress {
  const progress = normalizeProgress({
    phase: row.phase,
    completed: row.completed,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  });
  if (!progress) throw new BackendError('unreachable', 'malformed snapshot');
  return progress;
}

function toSnapshot(row: SnapshotRow): RemoteSnapshot {
  const uploads: Partial<Record<ChapterId, RemoteUpload>> = {};
  for (const u of row.uploads ?? []) {
    if (isChapterId(u.chapter_id)) uploads[u.chapter_id] = { chapterId: u.chapter_id, path: u.path, capturedAt: u.captured_at };
  }
  const responses = normalizeResponses(
    Object.fromEntries((row.responses ?? []).map((r) => [r.question_id, { value: r.value, updatedAt: r.updated_at }])),
  );
  return { progress: toProgress(row), responses, uploads };
}

/** Typsicherer RPC-Aufruf (Supabase liefert sonst `any`). */
async function callRpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const res = await sb.rpc(fn, args);
  return { data: res.data as unknown, error: res.error };
}

function isInvalidToken(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes('invalid_token'));
}

/**
 * Supabase-Anbindung ohne Login:
 * 1. Anonyme Supabase-Session (pro Gerät, automatisch).
 * 2. `join_trip(token)` verknüpft diese Session mit dem Trip (Token wird serverseitig gehasht verglichen).
 * 3. Alle Schreibzugriffe über RPC-Funktionen mit Mitgliedschaftsprüfung; Tabellen sind für Clients gesperrt.
 * 4. Fotos in privatem Bucket, Zugriff per RLS nur für Mitglieder des Trips.
 */
export function createSupabaseBackend(url: string, anonKey: string): TripBackend {
  let clientPromise: Promise<SupabaseClient> | null = null;
  let tripId: string | null = null;

  async function client(): Promise<SupabaseClient> {
    clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'vienna:auth',
        },
      }),
    );
    return clientPromise;
  }

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

    async connect(token) {
      const sb = await client();
      try {
        await ensureSession(sb);
      } catch (error) {
        if (error instanceof BackendError) throw error;
        throw new BackendError('unreachable', 'auth');
      }
      const { data, error } = await callRpc(sb, 'join_trip', { p_token: token });
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
      const sb = await client();
      const { data, error } = await callRpc(sb, 'save_progress', {
        p_trip_id: requireTrip(),
        p_phase: progress.phase,
        p_completed: progress.completed,
        p_started_at: progress.startedAt,
        p_finished_at: progress.finishedAt,
        p_language: language,
      });
      if (error) throw new BackendError('unreachable', error.message);
      return toProgress(data as SnapshotRow);
    },

    async saveResponse(questionId: QuestionId, value: string, updatedAt: string) {
      const sb = await client();
      const { error } = await callRpc(sb, 'save_response', {
        p_trip_id: requireTrip(),
        p_question_id: questionId,
        p_value: value,
        p_updated_at: updatedAt,
      });
      if (error) throw new BackendError('unreachable', error.message);
    },

    async uploadPhoto(chapterId: ChapterId, blob: Blob, capturedAt: string) {
      const sb = await client();
      const id = requireTrip();
      const random = crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36) ?? '0';
      const path = `${id}/${chapterId}-${Date.now().toString(36)}${random}.jpg`;
      const { error: uploadError } = await sb.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (uploadError) throw new BackendError('unreachable', uploadError.message);

      const { data, error } = await callRpc(sb, 'record_upload', {
        p_trip_id: id,
        p_chapter_id: chapterId,
        p_path: path,
        p_captured_at: capturedAt,
      });
      if (error) throw new BackendError('unreachable', error.message);

      const previous = typeof data === 'string' ? data : null;
      if (previous && previous !== path) {
        // Ersetztes Foto aufräumen – Fehler hier sind unkritisch.
        await sb.storage.from(PHOTO_BUCKET).remove([previous]).catch(() => undefined);
      }
      return path;
    },

    async downloadPhoto(path: string) {
      const sb = await client();
      const { data, error } = await sb.storage.from(PHOTO_BUCKET).download(path);
      if (error) throw new BackendError('unreachable', error.message);
      return data;
    },

    async reset() {
      const sb = await client();
      const { data, error } = await callRpc(sb, 'reset_trip', { p_trip_id: requireTrip() });
      if (error) throw new BackendError('unreachable', error.message);
      const paths = Array.isArray(data) ? (data as unknown[]).filter((p): p is string => typeof p === 'string') : [];
      // Zusätzlich alles im Trip-Ordner entfernen (auch verwaiste Dateien).
      const { data: listed } = await sb.storage.from(PHOTO_BUCKET).list(requireTrip(), { limit: 1000 });
      const all = new Set([...paths, ...(listed ?? []).map((f) => `${requireTrip()}/${f.name}`)]);
      if (all.size > 0) {
        const { error: removeError } = await sb.storage.from(PHOTO_BUCKET).remove([...all]);
        if (removeError) throw new BackendError('unreachable', removeError.message);
      }
    },
  };
}
