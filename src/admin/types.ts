import type { SnapshotRow } from '../lib/backend/supabaseBackend';

export interface AdminMember {
  device: string | null;
  joined_at: string;
  last_seen_at: string | null;
}

export interface AdminUpload {
  chapter_id: string;
  path: string;
  captured_at: string;
  uploaded_at: string;
}

export interface AdminTrip extends SnapshotRow {
  label: string | null;
  created_at: string;
  current_chapter: number;
  members: AdminMember[];
  uploads_detail: AdminUpload[];
}

export interface AdminApi {
  overview(): Promise<AdminTrip[]>;
  signedPhotoUrls(paths: string[]): Promise<Record<string, string>>;
  signedAssetUrl(path: string): Promise<string | null>;
  sendMessage(tripId: string, body: string, heart: boolean): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  uploadAsset(tripId: string, slot: string, file: File): Promise<void>;
  removeAsset(tripId: string, slot: string): Promise<void>;
  /** Live-Updates (Supabase Realtime). Gibt eine Abmeldefunktion zurück. */
  subscribe(onChange: () => void, onStatus: (live: boolean) => void): () => void;
}
