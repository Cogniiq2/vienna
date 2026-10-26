import type { AssetSlot } from '../config/family';
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

export interface AdminAsset {
  slot: string;
  path: string | null;
  mime: string | null;
  caption_sr?: string | null;
  caption_de?: string | null;
  year?: string | null;
  location?: string | null;
  note?: string | null;
  updated_at?: string | null;
}

export interface AdminTrip extends Omit<SnapshotRow, 'trip_id' | 'uploads' | 'assets'> {
  trip_id: string;
  label: string | null;
  created_at: string;
  current_chapter: number;
  members: AdminMember[];
  uploads: AdminUpload[];
  assets: AdminAsset[];
}

export interface AssetMetaInput {
  captionSr: string;
  captionDe: string;
  year: string;
  location: string;
  note: string;
}

export interface AdminApi {
  overview(): Promise<AdminTrip[]>;
  /** Signierte, kurzlebige URLs (privater Bucket) für Tagesfotos und Familien-Assets. */
  signedUrls(paths: string[]): Promise<Record<string, string>>;
  sendMessage(tripId: string, body: string, heart: boolean): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  uploadAsset(tripId: string, slot: AssetSlot, file: File): Promise<void>;
  updateAssetMeta(tripId: string, slot: AssetSlot, meta: AssetMetaInput): Promise<void>;
  removeAsset(tripId: string, slot: AssetSlot): Promise<void>;
  /** Live-Updates (Supabase Realtime auf dem Schema `vienna`). Gibt eine Abmeldefunktion zurück. */
  subscribe(onChange: () => void, onStatus: (live: boolean) => void): () => void;
}
