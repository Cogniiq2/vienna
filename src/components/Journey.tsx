import { useCallback, useEffect, useState } from 'react';
import { CHAPTER_IDS, type ChapterId } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { currentChapterIndex } from '../lib/progress';
import { useTripState, useTripStore } from '../state/context';
import { ChapterView } from './ChapterView';
import { ArrowBackIcon } from './Icons';
import { LockedChapter } from './LockedChapter';
import { StoryProgress } from './StoryProgress';
import { UnlockInterlude } from './UnlockInterlude';

export function Journey() {
  const { t } = useLanguage();
  const store = useTripStore();
  const { progress } = useTripState();
  const [viewing, setViewing] = useState<ChapterId | null>(null);
  const [interlude, setInterlude] = useState<number | null>(null);

  const currentIndex = currentChapterIndex(progress);
  const currentId = CHAPTER_IDS[currentIndex] ?? null;

  const select = useCallback((id: ChapterId | null) => {
    setViewing(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Wird ein angesehenes Kapitel per Reset/anderem Gerät ungültig, zurück zum aktuellen.
  const effectiveViewing = viewing && progress.completed.includes(viewing) ? viewing : null;

  const handleCompleted = useCallback(
    (id: ChapterId) => {
      const idx = CHAPTER_IDS.indexOf(id);
      store.completeChapter(id);
      if (idx < CHAPTER_IDS.length - 1) setInterlude(idx + 1);
      window.scrollTo({ top: 0 });
    },
    [store],
  );

  const endInterlude = useCallback(() => setInterlude(null), []);

  useEffect(() => {
    if (interlude === null) window.scrollTo({ top: 0 });
  }, [interlude, currentId]);

  if (!currentId) return null;

  return (
    <div className="journey page">
      <StoryProgress progress={progress} currentIndex={currentIndex} viewing={effectiveViewing} onSelect={select} />

      {effectiveViewing ? (
        <>
          <button type="button" className="text-link journey__back" onClick={() => select(null)}>
            <ArrowBackIcon size={16} />
            <span>{t.chapter.reviewBack}</span>
          </button>
          <p className="eyebrow journey__review-label">{t.chapter.reviewing}</p>
          <ChapterView key={`review-${effectiveViewing}`} chapterId={effectiveViewing} mode="review" />
        </>
      ) : (
        <>
          <ChapterView key={currentId} chapterId={currentId} mode="current" onCompleted={handleCompleted} />
          {currentIndex + 1 < CHAPTER_IDS.length && <LockedChapter index={currentIndex + 1} />}
        </>
      )}

      {interlude !== null && <UnlockInterlude index={interlude} onDone={endInterlude} />}
    </div>
  );
}
