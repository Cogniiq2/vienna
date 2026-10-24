import { CHAPTER_IDS, type ChapterId, type QuestionId } from '../config/chapters';
import type { Dictionary, Language } from '../content';
import type { MemoryPhoto } from '../pdf/generateMemory';
import type { TripStore } from '../state/tripStore';

export interface MemoryResult {
  blob: Blob;
  fileName: string;
  /** Anzahl Fotos, die existieren, aber auf diesem Gerät gerade nicht geladen werden konnten. */
  missing: number;
}

/** Sammelt Fotos & Antworten und erzeugt das PDF (pdf-lib wird erst hier nachgeladen). */
export async function buildMemory(store: TripStore, lang: Language, t: Dictionary): Promise<MemoryResult> {
  const state = store.getState();
  const photos: Partial<Record<ChapterId, MemoryPhoto>> = {};
  let missing = 0;

  await Promise.all(
    CHAPTER_IDS.map(async (id) => {
      const entry = state.photos[id];
      if (!entry) return;
      const blob = await store.getPhotoBlob(id);
      if (blob) photos[id] = { chapterId: id, blob, capturedAt: entry.capturedAt };
      else missing++;
    }),
  );

  const responses: Partial<Record<QuestionId, string>> = {};
  for (const [key, entry] of Object.entries(state.responses) as [QuestionId, { value: string }][]) {
    responses[key] = entry.value;
  }

  const { generateMemoryPdf } = await import('../pdf/generateMemory');
  const blob = await generateMemoryPdf({ lang, t, photos, responses, completed: state.progress.completed });
  return { blob, fileName: t.memory.fileName, missing };
}
