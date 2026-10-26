import type { ChapterId, QuestionId } from '../../config/chapters';
import type { AssetSlot } from '../../config/family';
import type { Language } from '../../content';
import type { Responses, TripProgress } from '../progress';

export interface RemoteUpload {
  chapterId: ChapterId;
  path: string;
  capturedAt: string;
}

/** Kleine Nachricht der Kinder (aus dem Admin-Dashboard). */
export interface LiveMessage {
  id: string;
  body: string;
  heart: boolean;
  createdAt: string;
  readAt: string | null;
}

/** Ein Familien-Asset aus dem Admin (privater Bucket) inkl. optionaler Metadaten. */
export interface RemoteAsset {
  slot: AssetSlot;
  /** null = nur Metadaten gepflegt, noch keine Datei. */
  path: string | null;
  mime: string | null;
  captionSr: string | null;
  captionDe: string | null;
  year: string | null;
  location: string | null;
  note: string | null;
  updatedAt: string | null;
}

export interface RemoteSnapshot {
  progress: TripProgress;
  responses: Responses;
  uploads: Partial<Record<ChapterId, RemoteUpload>>;
  messages: LiveMessage[];
  assets: Partial<Record<AssetSlot, RemoteAsset>>;
  /** Letzter Test-Reset am Server. Ältere lokale Stände werden verworfen. */
  resetAt: string | null;
}

export type BackendErrorCode = 'invalid-token' | 'unreachable' | 'not-connected';

export class BackendError extends Error {
  constructor(
    public readonly code: BackendErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BackendError';
  }
}

/**
 * Abstraktion über das Backend. `local` = kein Supabase konfiguriert (Demo / Fallback):
 * alles bleibt auf dem Gerät, die App funktioniert trotzdem vollständig.
 */
export interface TripBackend {
  readonly mode: 'supabase' | 'local';
  connect(token: string, device: string): Promise<RemoteSnapshot | null>;
  saveProgress(progress: TripProgress, language: Language): Promise<TripProgress | null>;
  saveResponse(questionId: QuestionId, value: string, updatedAt: string): Promise<void>;
  uploadPhoto(chapterId: ChapterId, blob: Blob, capturedAt: string): Promise<string | null>;
  downloadPhoto(path: string): Promise<Blob>;
  markMessageRead(id: string): Promise<void>;
  /** Signierte, kurzlebige URL für ein privates Familien-Asset. */
  assetUrl(path: string): Promise<string>;
  reset(): Promise<void>;
}
