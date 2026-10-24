import type { ChapterId, QuestionId } from '../../config/chapters';
import type { Language } from '../../content';
import type { Responses, TripProgress } from '../progress';

export interface RemoteUpload {
  chapterId: ChapterId;
  path: string;
  capturedAt: string;
}

export interface RemoteSnapshot {
  progress: TripProgress;
  responses: Responses;
  uploads: Partial<Record<ChapterId, RemoteUpload>>;
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
  connect(token: string): Promise<RemoteSnapshot | null>;
  saveProgress(progress: TripProgress, language: Language): Promise<TripProgress | null>;
  saveResponse(questionId: QuestionId, value: string, updatedAt: string): Promise<void>;
  uploadPhoto(chapterId: ChapterId, blob: Blob, capturedAt: string): Promise<string | null>;
  downloadPhoto(path: string): Promise<Blob>;
  reset(): Promise<void>;
}
