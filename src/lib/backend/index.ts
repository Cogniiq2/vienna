import { env } from '../env';
import { DEMO_TOKEN } from '../token';
import { createLocalBackend } from './localBackend';
import { createSupabaseBackend } from './supabaseBackend';
import type { TripBackend } from './types';

export * from './types';

export function createBackend(token: string): TripBackend {
  if (!env.isSupabaseConfigured || token === DEMO_TOKEN) return createLocalBackend();
  return createSupabaseBackend();
}
