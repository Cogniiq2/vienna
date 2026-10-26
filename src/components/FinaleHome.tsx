import { useEffect, useState, type CSSProperties } from 'react';
import { useLanguage } from '../i18n/context';
import { isEpilogueAvailable } from '../lib/epilogue';
import { hasFamilyStory } from '../lib/frames';
import { useTripState, useTripStore } from '../state/context';
import { ArrowIcon } from './Icons';
import { Gallery } from './Gallery';
import { MemoryGenerator } from './MemoryGenerator';

/** „Ваш дан.“ – Album, Erinnerungs-PDF und (ab Mittwochmorgen) der Epilog. */
export function FinaleHome({
  onReplay,
  onStory,
  onEpilogue,
}: {
  onReplay: () => void;
  onStory: () => void;
  onEpilogue: () => void;
}) {
  const { t } = useLanguage();
  const [creating, setCreating] = useState(false);
  const store = useTripStore();
  useTripState(); // neu bewerten, sobald neue Familien-Assets vom Server kommen
  const epilogue = isEpilogueAvailable();
  const story = hasFamilyStory((s) => store.hasAsset(s));
  const home = t.finale.home;

  // PDF-Bibliothek und Schriften schon im Hintergrund laden.
  useEffect(() => {
    void import('../pdf/generateMemory').then((m) => m.preloadPdfAssets()).catch(() => undefined);
  }, []);

  return (
    <section className="finale-home story" aria-labelledby="home-title">
      {epilogue && (
        <button type="button" className="epilogue-teaser" onClick={onEpilogue}>
          <span className="eyebrow eyebrow--accent">{home.epilogueEyebrow}</span>
          <span className="epilogue-teaser__title">{home.epilogueTitle}</span>
          <ArrowIcon size={18} />
        </button>
      )}

      <header className="finale-home__header">
        <h1 id="home-title" className="display reveal-blur">
          {home.title}
        </h1>
        <p className="serif-lead reveal" style={{ '--d': '400ms' } as CSSProperties}>
          {home.text}
        </p>
      </header>

      <Gallery />

      {story && (
        <button type="button" className="story-teaser" onClick={onStory}>
          <span className="eyebrow eyebrow--accent">{home.storyEyebrow}</span>
          <span className="story-teaser__title">{home.storyTitle}</span>
          <span className="small-text">{home.storyText}</span>
          <ArrowIcon size={18} />
        </button>
      )}

      <div className="finale-home__memory">
        <span className="rule" aria-hidden="true" />
        <h2 className="headline memory__title">{home.memoryTitle}</h2>
        <p className="body-text">{home.memoryText}</p>
        {creating ? (
          <MemoryGenerator />
        ) : (
          <div className="page__action">
            <button type="button" className="btn btn--primary btn--large" onClick={() => setCreating(true)}>
              {home.memoryCta}
            </button>
          </div>
        )}
      </div>

      <button type="button" className="text-link text-link--quiet finale-home__replay" onClick={onReplay}>
        {home.replay}
      </button>
    </section>
  );
}
