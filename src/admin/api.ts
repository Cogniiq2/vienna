import type { SupabaseClient } from '@supabase/supabase-js';
import { slotKind, type AssetSlot } from '../config/family';
import { callRpc, DAY_BUCKET, MEMORIES_BUCKET, storagePaths } from '../lib/supabaseClient';
import type { AdminApi, AdminTrip } from './types';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
};

/** Akzeptierte Dateien pro Slot – passend zu allowed_mime_types des Buckets. */
export function acceptFor(slot: AssetSlot): string {
  const kind = slotKind(slot);
  if (kind === 'audio') return 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/webm,.m4a,.mp3';
  if (kind === 'video') return 'video/mp4,video/quicktime,video/webm,.mp4,.mov';
  return 'image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.heic';
}

function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
}

/** Admin-Zugriffe – ausschließlich mit der E-Mail-Session des Admins, geprüft in der Datenbank. */
export function createAdminApi(sb: SupabaseClient): AdminApi {
  return {
    async overview() {
      const { data, error } = await callRpc(sb, 'vienna_admin_overview');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as AdminTrip[];
    },

    async signedUrls(paths) {
      // Tagesfotos liegen in `vienna-day`, Familien-Assets in `vienna-memories` (Admin-Storage-Policy).
      const out: Record<string, string> = {};
      const groups: Array<[string, string[]]> = [
        [DAY_BUCKET, paths.filter((p) => storagePaths.isDayPhoto(p))],
        [MEMORIES_BUCKET, paths.filter((p) => !storagePaths.isDayPhoto(p))],
      ];
      for (const [bucket, list] of groups) {
        if (list.length === 0) continue;
        const { data, error } = await sb.storage.from(bucket).createSignedUrls(list, 60 * 60);
        if (error) throw new Error(error.message);
        for (const item of data) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
      }
      return out;
    },

    async sendMessage(tripId, body, heart) {
      const { error } = await callRpc(sb, 'vienna_admin_send_message', { p_trip_id: tripId, p_body: body, p_heart: heart });
      if (error) throw new Error(error.message);
    },

    async deleteMessage(id) {
      const { error } = await callRpc(sb, 'vienna_admin_delete_message', { p_message_id: id });
      if (error) throw new Error(error.message);
    },

    async uploadAsset(tripId, slot, file) {
      const type = mimeOf(file);
      const ext = EXTENSIONS[type] ?? file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = storagePaths.asset(tripId, slotKind(slot), slot, Date.now().toString(36), ext);
      const { error: uploadError } = await sb.storage.from(MEMORIES_BUCKET).upload(path, file, { contentType: type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data, error } = await callRpc(sb, 'vienna_admin_set_asset', { p_trip_id: tripId, p_slot: slot, p_path: path, p_mime: type });
      if (error) {
        await sb.storage.from(MEMORIES_BUCKET).remove([path]);
        throw new Error(error.message);
      }
      if (typeof data === 'string' && data !== path) await sb.storage.from(MEMORIES_BUCKET).remove([data]);
    },

    async updateAssetMeta(tripId, slot, meta) {
      const { error } = await callRpc(sb, 'vienna_admin_update_asset_meta', {
        p_trip_id: tripId,
        p_slot: slot,
        p_caption_sr: meta.captionSr,
        p_caption_de: meta.captionDe,
        p_year: meta.year,
        p_location: meta.location,
        p_note: meta.note,
      });
      if (error) throw new Error(error.message);
    },

    async removeAsset(tripId, slot) {
      const { data, error } = await callRpc(sb, 'vienna_admin_remove_asset', { p_trip_id: tripId, p_slot: slot });
      if (error) throw new Error(error.message);
      if (typeof data === 'string') await sb.storage.from(MEMORIES_BUCKET).remove([data]);
    },

    subscribe(onChange, onStatus) {
      const channel = sb.channel('vienna-admin');
      for (const table of ['trips', 'devices', 'uploads', 'answers', 'messages', 'assets']) {
        channel.on('postgres_changes', { event: '*', schema: 'vienna', table }, () => onChange());
      }
      channel.subscribe((status) => onStatus(`${status}` === 'SUBSCRIBED'));
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
