/**
 * Build-time Konfiguration (Vite inlined VITE_* Variablen beim Build).
 * Alle Werte hier sind öffentlich – niemals Secrets (z. B. Service-Role-Key) als VITE_* setzen.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  // HTTPS; http nur für lokale Entwicklung (supabase start / lokaler Stack).
  isSupabaseConfigured: /^(https:\/\/.+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(url) && anonKey.length > 20,
  /** Debug-Panel: immer im Dev-Server, in Builds nur wenn VITE_ENABLE_DEBUG=true. */
  debugAvailable: import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === 'true',
  isDev: import.meta.env.DEV,
} as const;
