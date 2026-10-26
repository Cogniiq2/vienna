import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { seenKey, type FinaleStage } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { nextFinaleStage } from '../lib/frames';
import { useTripState, useTripStore } from '../state/context';
import { Epilogue } from './Epilogue';
import { FamilyStory } from './FamilyStory';
import { FinaleHome } from './FinaleHome';
import { ArrowIcon } from './Icons';
import { MusicCard } from './MusicCard';
import { Reveal } from './Reveal';
import { StorySequence } from './StorySequence';

type View = 'flow' | 'home' | 'replay' | 'story' | 'epilogue';

/**
 * Ende des Dienstags: „Имамо још нешто.“ + Brief → kurzer, stiller Abschluss („Јел’ знате?“ …
 * dezent mit dem aktuellen Familienfoto) → „Ваш дан.“. Die Familiengeschichte ist ein eigener,
 * späterer Bereich und erscheint erst, wenn dafür Fotos/Medien hochgeladen sind.
 */
export function Finale({ onImmersive }: { onImmersive: (on: boolean) => void }) {
  const { t } = useLanguage();
  const store = useTripStore();
  const { progress } = useTripState();
  const stage = nextFinaleStage(progress.seen);
  const [view, setView] = useState<View>('flow');
  const immersive = (view === 'flow' && stage === 'closing') || view === 'replay' || view === 'story';

  useEffect(() => {
    onImmersive(immersive);
    return () => onImmersive(false);
  }, [immersive, onImmersive]);

  const complete = useCallback(
    (s: FinaleStage) => {
      store.markSeen(seenKey.finale(s));
      window.scrollTo({ top: 0 });
    },
    [store],
  );

  const toHome = useCallback(() => {
    setView('home');
    window.scrollTo({ top: 0 });
  }, []);

  if (view === 'replay') return <StorySequence frames={t.finale.closing} onDone={toHome} immersive />;
  if (view === 'story') return <FamilyStory onDone={toHome} />;
  if (view === 'epilogue') return <Epilogue onBack={toHome} />;
  if (view === 'flow' && stage === 'letter') return <Letter onDone={() => complete('letter')} />;
  if (view === 'flow' && stage === 'closing') {
    return <StorySequence frames={t.finale.closing} onDone={() => complete('closing')} immersive />;
  }
  return (
    <FinaleHome
      onReplay={() => setView('replay')}
      onStory={() => setView('story')}
      onEpilogue={() => setView('epilogue')}
    />
  );
}

function Letter({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage();
  const { letter } = t.finale;
  return (
    <section className="story finale" aria-labelledby="letter-title">
      <div className="story__screen story__screen--center">
        <h1 id="letter-title" className="display finale__more reveal-blur" style={{ '--d': '400ms' } as CSSProperties}>
          {t.finale.title}
        </h1>
      </div>

      <div className="story__screen letter">
        <Reveal>
          <p className="letter__salutation">{letter.salutation}</p>
        </Reveal>
        {letter.opening.map((p) => (
          <Reveal key={p}>
            <p className="letter__p">{p}</p>
          </Reveal>
        ))}
        <Reveal>
          <p className="letter__emphasis">{letter.emphasis}</p>
        </Reveal>
        <ul className="letter__list">
          {letter.list.map((item, i) => (
            <li key={item}>
              <Reveal delay={i * 160}>
                <span>{item}</span>
              </Reveal>
            </li>
          ))}
        </ul>
        {letter.after.map((p) => (
          <Reveal key={p}>
            <p className="letter__p">{p}</p>
          </Reveal>
        ))}
        <Reveal>
          <p className="letter__closing">{letter.closing}</p>
        </Reveal>
        <MusicCard slot="finale" />
        <Reveal>
          <div className="page__action">
            <button type="button" className="btn btn--primary btn--large" onClick={onDone}>
              <span>{t.common.next}</span>
              <ArrowIcon size={18} />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
