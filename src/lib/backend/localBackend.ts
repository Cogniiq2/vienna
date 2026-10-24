import type { TripBackend } from './types';
import { BackendError } from './types';

/** Kein Server: Fortschritt & Fotos liegen ausschließlich lokal (localStorage + IndexedDB). */
export function createLocalBackend(): TripBackend {
  return {
    mode: 'local',
    connect: () => Promise.resolve(null),
    saveProgress: () => Promise.resolve(null),
    saveResponse: () => Promise.resolve(),
    uploadPhoto: () => Promise.resolve(null),
    downloadPhoto: () => Promise.reject(new BackendError('not-connected')),
    markMessageRead: () => Promise.resolve(),
    assetUrl: () => Promise.reject(new BackendError('not-connected')),
    reset: () => Promise.resolve(),
  };
}
