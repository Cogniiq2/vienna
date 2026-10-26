import { CHAPTER_IDS, QUESTION_IDS, QUESTIONS, type ChapterId, type QuestionId } from '../config/chapters';
import type { Dictionary, Language } from '../content';
import type { MemoryAssetSlot, MemoryPhoto } from '../pdf/generateMemory';
import type { TripStore } from '../state/tripStore';

export interface MemoryResult {
  blob: Blob;
  fileName: string;
  /** Anzahl Fotos, die existieren, aber auf diesem Gerät gerade nicht geladen werden konnten. */
  missing: number;
}

const MEMORY_SLOTS: readonly MemoryAssetSlot[] = ['gradskiKlub', 'wedding', 'familyEarly', 'familyCurrent', 'parentsCurrent'];

/** Antworten so, wie sie im Album stehen sollen (Auswahl-Schlüssel → Beschriftung). */
export function displayAnswers(t: Dictionary, responses: Partial<Record<QuestionId, { value: string }>>): Partial<Record<QuestionId, string>> {
  const out: Partial<Record<QuestionId, string>> = {};
  for (const id of QUESTION_IDS) {
    const value = responses[id]?.value?.trim();
    if (!value) continue;
    const kind = QUESTIONS[id];
    out[id] = kind.type === 'choice' ? (t.questions[id].options?.[value] ?? value) : value;
  }
  return out;
}

/**
 * Sammelt Tagesfotos, Familienfotos und Antworten und erzeugt das PDF (pdf-lib wird erst hier nachgeladen).
 * Fehlende Familienfotos sind kein Fehler – die Seite wird dann einfach ausgelassen.
 */
export async function buildMemory(store: TripStore, lang: Language, t: Dictionary): Promise<MemoryResult> {
  const state = store.getState();
  const photos: Partial<Record<ChapterId, MemoryPhoto>> = {};
  let missing = 0;

  const [, assetEntries] = await Promise.all([
    Promise.all(
      CHAPTER_IDS.map(async (id) => {
        const entry = state.photos[id];
        if (!entry) return;
        const blob = await store.getPhotoBlob(id);
        if (blob) photos[id] = { chapterId: id, blob, capturedAt: entry.capturedAt };
        else missing++;
      }),
    ),
    Promise.all(MEMORY_SLOTS.filter((slot) => store.hasAsset(slot)).map(async (slot) => [slot, await store.getAssetBlob(slot)] as const)),
  ]);

  const assets: Partial<Record<MemoryAssetSlot, Blob>> = {};
  for (const [slot, blob] of assetEntries) if (blob) assets[slot] = blob;

  const assetMeta: Partial<Record<MemoryAssetSlot, { caption: string | null; year: string | null; location: string | null }>> = {};
  for (const slot of MEMORY_SLOTS) assetMeta[slot] = store.getAssetMeta(slot, lang);

  const { generateMemoryPdf } = await import('../pdf/generateMemory');
  const blob = await generateMemoryPdf({
    lang,
    t,
    photos,
    assets,
    assetMeta,
    answers: displayAnswers(t, state.responses),
    completed: state.progress.completed,
  });
  return { blob, fileName: t.memory.fileName, missing };
}
