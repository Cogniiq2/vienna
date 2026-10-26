import { useCallback, useEffect, useState } from 'react';
import { CHAPTER_IDS, seenKey, STORY, type ChapterId } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { currentChapterIndex, currentStepIndex } from '../lib/progress';
import { useTripState, useTripStore } from '../state/context';
import { ChapterView } from './ChapterView';
import { ArrowBackIcon } from './Icons';
import { LockedChapter } from './LockedChapter';
import { StoryProgress } from './StoryProgress';
import { StorySequence } from './StorySequence';
import { UnlockInterlude } from './UnlockInterlude';

/** Der Tag: Erinnerung → Kapitel → Erinnerung → Kapitel … */
export function Journey() {
  const { t } = useLanguage();
  const store = useTripStore();
  const { progress } = useTripState();
  const [viewing, setViewing] = useState<ChapterId | null>(null);
  const [unlock, setUnlock] = useState<number | null>(null);

  const stepIndex = currentStepIndex(progress);
  const step = STORY[stepIndex] ?? null;
  const nextStep = STORY[stepIndex + 1] ?? null;
  const chapterIdx = currentChapterIndex(progress);

  const select = useCallback((id: ChapterId | null) => {
    setViewing(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const effectiveViewing = viewing && progress.completed.includes(viewing) ? viewing : null;

  const handleCompleted = useCallback(
    (id: ChapterId) => {
      store.completeChapter(id);
      const after = STORY[STORY.findIndex((s) => s.kind === 'chapter' && s.id === id) + 1];
      // Folgt direkt ein Kapitel, öffnet sich das Schloss. Folgt eine Erinnerung, ist sie selbst der Übergang.
      if (after?.kind === 'chapter') setUnlock(CHAPTER_IDS.indexOf(after.id));
      window.scrollTo({ top: 0 });
    },
    [store],
  );

  const interludeId = step?.kind === 'interlude' ? step.id : null;
  const finishInterlude = useCallback(() => {
    if (!interludeId) return;
    store.markSeen(seenKey.interlude(interludeId));
    if (nextStep?.kind === 'chapter') setUnlock(CHAPTER_IDS.indexOf(nextStep.id));
    window.scrollTo({ top: 0 });
  }, [store, interludeId, nextStep]);

  const endUnlock = useCallback(() => setUnlock(null), []);

  useEffect(() => {
    if (unlock === null) window.scrollTo({ top: 0 });
  }, [unlock, stepIndex]);

  if (!step) return null;

  if (step.kind === 'interlude' && !effectiveViewing) {
    return (
      <div className="journey journey--interlude">
        <StorySequence
          key={step.id}
          frames={t.interludes[step.id]}
          onDone={finishInterlude}
          eyebrow={t.pdf.memoryEyebrow}
        />
        {unlock !== null && <UnlockInterlude index={unlock} onDone={endUnlock} />}
      </div>
    );
  }

  const currentId = step.kind === 'chapter' ? step.id : null;

  return (
    <div className="journey">
      <StoryProgress progress={progress} currentIndex={chapterIdx} viewing={effectiveViewing} onSelect={select} />

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
        currentId && (
          <>
            <ChapterView key={currentId} chapterId={currentId} mode="current" onCompleted={handleCompleted} />
            {chapterIdx + 1 < CHAPTER_IDS.length && <LockedChapter index={chapterIdx + 1} />}
          </>
        )
      )}

      {unlock !== null && <UnlockInterlude index={unlock} onDone={endUnlock} />}
    </div>
  );
}
