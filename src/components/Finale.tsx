import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { seenKey, type FinaleStage } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { useTripState, useTripStore } from '../state/context';
import { Epilogue } from './Epilogue';
import { FinaleHome } from './FinaleHome';
import { ArrowIcon } from './Icons';
import { hasFamilyMedia, nextFinaleStage } from '../lib/frames';
import { ChildrenVoices, FamilyVideo } from './MediaPlayers';
import { MusicCard } from './MusicCard';
import { Reveal } from './Reveal';
import { StorySequence } from './StorySequence';

type View = { kind: 'flow' } | { kind: 'home' } | { kind: 'replay' } | { kind: 'epilogue' };

/**
 * Nach dem letzten Kapitel: „Имамо још нешто.“ → Brief → Video & Stimmen → Bonus „Само за вас двоје.“
 * → „Ваш дан.“ (Album, PDF, später Epilog). Jede Station wird gemerkt.
 */
export function Finale({ onImmersive }: { onImmersive: (on: boolean) => void }) {
  const store = useTripStore();
  const { progress } = useTripState();
  const mediaAvailable = hasFamilyMedia((s) => store.hasAsset(s));
  const stage = nextFinaleStage(progress.seen, mediaAvailable);

  const [view, setView] = useState<View>({ kind: 'flow' });
  const immersive = (view.kind === 'flow' && stage === 'bonus') || view.kind === 'replay';

  useEffect(() => {
    onImmersive(immersive);
    return () => onImmersive(false);
  }, [immersive, onImmersive]);

  const complete = useCallback(
    (s: FinaleStage) => {
      store.markSeen(seenKey.finale(s));
      if (s === 'more' && !mediaAvailable) store.markSeen(seenKey.finale('messages'));
      window.scrollTo({ top: 0 });
    },
    [store, mediaAvailable],
  );

  const toHome = useCallback(() => {
    setView({ kind: 'home' });
    window.scrollTo({ top: 0 });
  }, []);

  if (view.kind === 'replay') return <Bonus onDone={toHome} />;
  if (view.kind === 'epilogue') return <Epilogue onBack={toHome} />;
  if (view.kind === 'flow' && stage === 'more') return <More onDone={() => complete('more')} />;
  if (view.kind === 'flow' && stage === 'messages') return <Messages onDone={() => complete('messages')} />;
  if (view.kind === 'flow' && stage === 'bonus') return <Bonus onDone={() => complete('bonus')} />;
  return <FinaleHome onReplay={() => setView({ kind: 'replay' })} onEpilogue={() => setView({ kind: 'epilogue' })} />;
}

function More({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage();
  const { letter } = t.finale;
  return (
    <section className="story finale" aria-labelledby="more-title">
      <div className="story__screen story__screen--center">
        <h1 id="more-title" className="display finale__more reveal-blur" style={{ '--d': '400ms' } as CSSProperties}>
          {t.finale.more.title}
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
              <span>{t.finale.more.cta}</span>
              <ArrowIcon size={18} />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Messages({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage();
  return (
    <section className="story finale finale--media">
      <div className="story__screen">
        <FamilyVideo />
      </div>
      <div className="story__screen">
        <ChildrenVoices />
        <div className="page__action">
          <button type="button" className="btn btn--primary btn--large" onClick={onDone}>
            <span>{t.common.next}</span>
            <ArrowIcon size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

function Bonus({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage();
  const [started, setStarted] = useState(false);
  if (!started) {
    return (
      <section className="bonus-intro" aria-labelledby="bonus-title">
        <h1 id="bonus-title" className="display reveal-blur" style={{ '--d': '300ms' } as CSSProperties}>
          {t.finale.bonusIntro.title}
        </h1>
        <p className="serif-lead reveal" style={{ '--d': '1300ms' } as CSSProperties}>
          {t.finale.bonusIntro.subtitle}
        </p>
        <button type="button" className="sequence__next reveal" style={{ '--d': '2200ms' } as CSSProperties} onClick={() => setStarted(true)}>
          <span>{t.finale.bonusIntro.cta}</span>
          <ArrowIcon size={16} />
        </button>
      </section>
    );
  }
  return <StorySequence frames={t.finale.bonus} onDone={onDone} immersive />;
}
