import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKETS, callRpc } from '../lib/supabaseClient';
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
  'text/vtt': 'vtt',
};

/** Admin-Zugriffe – ausschließlich mit der E-Mail-Session des Admins, geprüft in der Datenbank. */
export function createAdminApi(sb: SupabaseClient): AdminApi {
  return {
    async overview() {
      const { data, error } = await callRpc(sb, 'admin_overview');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as AdminTrip[];
    },

    async signedPhotoUrls(paths) {
      if (paths.length === 0) return {};
      const { data, error } = await sb.storage.from(BUCKETS.photos).createSignedUrls(paths, 60 * 60);
      if (error) throw new Error(error.message);
      const out: Record<string, string> = {};
      for (const item of data) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
      return out;
    },

    async signedAssetUrl(path) {
      const { data } = await sb.storage.from(BUCKETS.family).createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },

    async sendMessage(tripId, body, heart) {
      const { error } = await callRpc(sb, 'admin_send_message', { p_trip_id: tripId, p_body: body, p_heart: heart });
      if (error) throw new Error(error.message);
    },

    async deleteMessage(id) {
      const { error } = await callRpc(sb, 'admin_delete_message', { p_message_id: id });
      if (error) throw new Error(error.message);
    },

    async uploadAsset(tripId, slot, file) {
      const type = file.type || 'application/octet-stream';
      const ext = EXTENSIONS[type] ?? file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${tripId}/${slot}-${Date.now().toString(36)}.${ext}`;
      const { error: uploadError } = await sb.storage.from(BUCKETS.family).upload(path, file, { contentType: type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data, error } = await callRpc(sb, 'admin_set_asset', { p_trip_id: tripId, p_slot: slot, p_path: path, p_mime: type });
      if (error) throw new Error(error.message);
      if (typeof data === 'string' && data !== path) await sb.storage.from(BUCKETS.family).remove([data]);
    },

    async removeAsset(tripId, slot) {
      const { data, error } = await callRpc(sb, 'admin_remove_asset', { p_trip_id: tripId, p_slot: slot });
      if (error) throw new Error(error.message);
      if (typeof data === 'string') await sb.storage.from(BUCKETS.family).remove([data]);
    },

    subscribe(onChange, onStatus) {
      const channel = sb.channel('vienna-admin');
      for (const table of ['trips', 'trip_members', 'uploads', 'responses', 'messages']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
      }
      channel.subscribe((status) => onStatus(`${status}` === 'SUBSCRIBED'));
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
