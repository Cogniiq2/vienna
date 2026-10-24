import { CHAPTER_IDS, type ChapterId, type QuestionId } from '../config/chapters';

/** Familienfotos, die im Album vorkommen können. */
export type MemoryAssetSlot = 'gradskiKlub' | 'wedding' | 'familyEarly' | 'familyCurrent' | 'parentsNow';

export type PagePlan =
  | { kind: 'cover'; photo: ChapterId | null }
  | { kind: 'letter' }
  | { kind: 'memory'; slot: 'gradskiKlub' | 'wedding' | 'familyEarly' }
  | { kind: 'chapter'; id: ChapterId }
  | { kind: 'story' }
  | { kind: 'answers'; questions: QuestionId[] }
  | { kind: 'family' }
  | { kind: 'closing' };

/** Große Zitate am Ende – in dieser Reihenfolge. */
export const QUOTE_QUESTIONS: readonly QuestionId[] = [
  'dinner.moment',
  'dinner.still',
  'spa.lastDay',
  'dinner.repeat',
  'epilogue.takeaway',
];

/** Erinnerungsseiten stehen VOR diesen Kapiteln (wie in der App). */
const MEMORY_BEFORE: Partial<Record<ChapterId, 'gradskiKlub' | 'wedding' | 'familyEarly'>> = {
  morning: 'gradskiKlub',
  mission: 'wedding',
  vienna: 'familyEarly',
};

export interface PlanInput {
  photos: ReadonlySet<ChapterId>;
  assets: ReadonlySet<MemoryAssetSlot>;
  answers: Partial<Record<QuestionId, string>>;
  completed: readonly ChapterId[];
}

/**
 * Reihenfolge des Albums – rein & testbar:
 * Cover → Brief → (Gradski Klub) → I → (Hochzeit) → II → (Familie) → III → IV → Familiengeschichte → V → VI
 * → eure Worte → (Familie heute) → „Јел’ знате?“.
 * Fehlt ein Foto, fällt nur die jeweilige Seite weg – nie das ganze PDF.
 */
export function planMemoryPages(input: PlanInput): PagePlan[] {
  const pages: PagePlan[] = [];
  const cover = (['dinner', 'morning', 'tennis', 'spa', 'mission'] as const).find((id) => input.photos.has(id)) ?? null;
  pages.push({ kind: 'cover', photo: cover });
  pages.push({ kind: 'letter' });

  for (const id of CHAPTER_IDS) {
    const memory = MEMORY_BEFORE[id];
    if (memory && input.assets.has(memory)) pages.push({ kind: 'memory', slot: memory });
    if (id === 'spa') pages.push({ kind: 'story' });
    if (input.photos.has(id) || input.completed.includes(id)) pages.push({ kind: 'chapter', id });
  }

  const quotes = QUOTE_QUESTIONS.filter((q) => input.answers[q]?.trim());
  // Lange Antworten bekommen mehr Platz: höchstens 3 Zitate pro Seite.
  for (let i = 0; i < quotes.length; i += 3) pages.push({ kind: 'answers', questions: quotes.slice(i, i + 3) });

  if (input.assets.has('familyCurrent')) pages.push({ kind: 'family' });
  pages.push({ kind: 'closing' });
  return pages;
}
